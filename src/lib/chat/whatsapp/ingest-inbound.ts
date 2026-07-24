// Ingestion des WhatsApp entrants — par l'API Events, la voie découverte au test réel
// du 24/07/2026 (message « Test » de Robin) :
//
//   métrique `Sent WhatsApp` (VVJZsp)  = message ENTRANT de la cliente, avec
//     Message Body, From Number, WhatsApp Display Name, datetime exact.
//     (Convention Klaviyo inversée, cohérente avec `sent_sms` : « sent » = envoyé PAR la
//     cliente. `Received WhatsApp` (WNzZPH) = délivré À la cliente.)
//   métrique `Received Automated Response WhatsApp` (VFReqd) = l'auto-réponse Klaviyo
//     renvoyée à la cliente — affichée dans le fil pour qu'on sache ce qu'elle a déjà lu.
//
// Cette voie rend la watchlist + le polling par profil OBSOLÈTES : un seul balayage
// par tour de cron, corps complets, horodatage exact (donc fenêtre de 24 h exacte),
// clé privée suffisante. L'API Conversations ne sert plus qu'à deux choses :
// récupérer l'id de conversation (pour répondre) et envoyer (OAuth requis).
//
// Dédup : external_id = `wa_evt_<id d'évènement Klaviyo>` (index unique en base).

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhone, buildDeliveryContext } from "./delivery-context"
import { getWhatsappConversation } from "./klaviyo-conversations"

const INBOUND_METRIC = "VVJZsp" // Sent WhatsApp = entrant (id compte FR, 24/07/2026)
const AUTORESPONSE_METRIC = "VFReqd" // Received Automated Response WhatsApp
const HWM_KEY = "fr:klaviyo:whatsapp_inbound_hwm"
// Premier passage : 24 h en arrière (le canal natif date du 24/07, pas d'historique à éviter).
const FIRST_RUN_LOOKBACK_MS = 24 * 3600_000
const MAX_PAGES = 3

type KlaviyoEvent = {
  id: string
  attributes?: {
    datetime?: string
    event_properties?: Record<string, unknown>
  }
  relationships?: { profile?: { data?: { id?: string } } }
}

type EventsPage = {
  data?: KlaviyoEvent[]
  included?: Array<{ id: string; attributes?: { phone_number?: string | null; first_name?: string | null } }>
  links?: { next?: string | null }
}

async function fetchPage(url: string): Promise<EventsPage | null> {
  const key = process.env.KLAVIYO_API_KEY
  if (!key) return null
  const response = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: "2025-01-15",
      accept: "application/json",
    },
    cache: "no-store",
  })
  if (!response.ok) return null
  return response.json()
}

async function fetchEventsSince(
  metricId: string,
  sinceIso: string
): Promise<{ events: KlaviyoEvent[]; profiles: Map<string, { phone: string | null; firstName: string | null }> }> {
  const filter = encodeURIComponent(
    `and(equals(metric_id,"${metricId}"),greater-than(datetime,${sinceIso}))`
  )
  let url: string | null =
    `https://a.klaviyo.com/api/events?filter=${filter}` +
    `&include=profile&fields[profile]=phone_number,first_name` +
    `&sort=datetime&page[size]=200`
  const events: KlaviyoEvent[] = []
  const profiles = new Map<string, { phone: string | null; firstName: string | null }>()
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const json = await fetchPage(url)
    if (!json) break
    events.push(...(json.data || []))
    for (const p of json.included || []) {
      profiles.set(p.id, {
        phone: p.attributes?.phone_number ?? null,
        firstName: p.attributes?.first_name ?? null,
      })
    }
    url = json.links?.next ?? null
  }
  return { events, profiles }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null)

/** Trouve le fil WhatsApp d'un profil, ou le crée avec le dossier commande rattaché. */
async function findOrCreateThread(
  db: SupabaseClient,
  profileId: string,
  phone: string,
  firstName: string | null
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await db
    .from("chat_conversations")
    .select("id")
    .eq("channel", "whatsapp")
    .eq("klaviyo_profile_id", profileId)
    .maybeSingle()
  if (existing) return { id: existing.id, created: false }

  // L'id de conversation Klaviyo est indispensable pour répondre : on le prend maintenant.
  const conversation = await getWhatsappConversation(profileId)
  const context = await buildDeliveryContext(phone)

  const { data: created, error } = await db
    .from("chat_conversations")
    .insert({
      token: `wa_${profileId}`,
      channel: "whatsapp",
      market: "FR",
      status: "human", // jamais de bot sur WhatsApp : réponse humaine obligatoire
      visitor_phone: phone,
      visitor_email: context.email,
      visitor_name: context.firstName ?? firstName,
      klaviyo_profile_id: profileId,
      klaviyo_conversation_id: conversation?.id ?? null,
      customer_orders_count: context.ordersLifetime,
    })
    .select("id")
    .single()
  if (error || !created) return null
  return { id: created.id, created: true }
}

export type IngestResult = {
  inbound: number
  autoResponses: number
  newConversations: number
  errors: string[]
}

/**
 * Un passage d'ingestion. Idempotent (dédup par external_id), ~2-3 appels API par tour.
 * N'envoie JAMAIS rien : lecture et journalisation uniquement.
 */
export async function ingestInboundWhatsapp(db: SupabaseClient): Promise<IngestResult> {
  const errors: string[] = []
  const result: IngestResult = { inbound: 0, autoResponses: 0, newConversations: 0, errors }

  const { data: cached } = await db.from("data_cache").select("data").eq("key", HWM_KEY).maybeSingle()
  const hwm: string =
    (cached?.data as { hwm?: string } | null)?.hwm ??
    new Date(Date.now() - FIRST_RUN_LOOKBACK_MS).toISOString()

  const [inboundBatch, autoBatch] = await Promise.all([
    fetchEventsSince(INBOUND_METRIC, hwm),
    fetchEventsSince(AUTORESPONSE_METRIC, hwm),
  ])

  let maxSeen = hwm
  const touchedThreads = new Map<string, { lastInboundAt: string | null; newInbound: number }>()

  // 1. Les messages entrants — chronologiques, corps réels.
  for (const event of inboundBatch.events) {
    const at = event.attributes?.datetime
    if (at && at > maxSeen) maxSeen = at
    const profileId = event.relationships?.profile?.data?.id
    if (!profileId) continue
    const props = event.attributes?.event_properties || {}
    const profile = inboundBatch.profiles.get(profileId)
    const rawPhone = str(props["From Number"]) ?? profile?.phone
    if (!rawPhone) {
      errors.push(`évènement ${event.id} sans numéro`)
      continue
    }
    const phone = normalizePhone(rawPhone)

    try {
      const thread = await findOrCreateThread(db, profileId, phone, profile?.firstName ?? null)
      if (!thread) {
        errors.push(`fil impossible pour ${profileId}`)
        continue
      }
      if (thread.created) result.newConversations++

      const { data: inserted, error: insertError } = await db
        .from("chat_messages")
        .upsert(
          {
            conversation_id: thread.id,
            external_id: `wa_evt_${event.id}`,
            role: "user",
            content: str(props["Message Body"]) ?? "(message sans texte — pièce jointe ?)",
            created_at: at ?? new Date().toISOString(),
          },
          { onConflict: "external_id", ignoreDuplicates: true }
        )
        .select("id")
      if (insertError) {
        errors.push(`message ${event.id}: ${insertError.message}`)
        continue
      }
      if ((inserted?.length ?? 0) > 0) {
        result.inbound++
        const t = touchedThreads.get(thread.id) ?? { lastInboundAt: null, newInbound: 0 }
        t.newInbound++
        if (!t.lastInboundAt || (at && at > t.lastInboundAt)) t.lastInboundAt = at ?? t.lastInboundAt
        touchedThreads.set(thread.id, t)
      }
    } catch (err) {
      errors.push(`${profileId}: ${(err as Error).message}`)
    }
  }

  // 2. Les auto-réponses Klaviyo — journalisées pour savoir ce que la cliente a déjà reçu.
  for (const event of autoBatch.events) {
    const at = event.attributes?.datetime
    if (at && at > maxSeen) maxSeen = at
    const profileId = event.relationships?.profile?.data?.id
    if (!profileId) continue
    const props = event.attributes?.event_properties || {}
    const { data: thread } = await db
      .from("chat_conversations")
      .select("id")
      .eq("channel", "whatsapp")
      .eq("klaviyo_profile_id", profileId)
      .maybeSingle()
    if (!thread) continue // pas de fil = pas d'entrant connu ; l'auto-réponse seule ne crée rien
    const { data: inserted } = await db
      .from("chat_messages")
      .upsert(
        {
          conversation_id: thread.id,
          external_id: `wa_evt_${event.id}`,
          role: "system",
          content: `Réponse automatique envoyée : « ${str(props["Message Body"]) ?? "?"} »`,
          created_at: at ?? new Date().toISOString(),
        },
        { onConflict: "external_id", ignoreDuplicates: true }
      )
      .select("id")
    if ((inserted?.length ?? 0) > 0) result.autoResponses++
  }

  // 3. Métadonnées des fils touchés : fenêtre de 24 h EXACTE (datetime du dernier entrant).
  for (const [threadId, t] of touchedThreads) {
    const { data: current } = await db
      .from("chat_conversations")
      .select("unread_count, message_count")
      .eq("id", threadId)
      .single()
    const update: Record<string, unknown> = {
      unread_count: (current?.unread_count ?? 0) + t.newInbound,
      message_count: (current?.message_count ?? 0) + t.newInbound,
    }
    if (t.lastInboundAt) {
      update.last_message_at = t.lastInboundAt
      update.service_window_expires_at = new Date(
        new Date(t.lastInboundAt).getTime() + 24 * 3600_000
      ).toISOString()
    }
    await db.from("chat_conversations").update(update).eq("id", threadId)
  }

  if (maxSeen > hwm) {
    const { error } = await db
      .from("data_cache")
      .upsert(
        { key: HWM_KEY, data: { hwm: maxSeen }, source: "cron", updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
    if (error) errors.push(`hwm: ${error.message}`)
  }

  return result
}
