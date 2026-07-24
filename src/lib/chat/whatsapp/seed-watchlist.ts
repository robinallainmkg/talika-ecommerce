// Alimente la watchlist de polling depuis la métrique Klaviyo `Received WhatsApp`
// (WNzZPH = message DÉLIVRÉ à la cliente).
//
// Pourquoi pas le webhook `event:klaviyo.received_whatsapp` prévu au départ :
// la création de webhooks par API répond « You must have Advanced KDP enabled »
// (testé le 24/07/2026) — option payante absente du compte. Ce balayage lit la même
// information par l'API Events (clé privée OK) avec une latence d'un tour de cron
// (~2 min), largement suffisante : on surveille des clientes susceptibles de répondre
// dans les heures qui suivent. La route /api/whatsapp/klaviyo-hook reste déployée au
// cas où le webhook deviendrait possible un jour.
//
// High-water mark dans data_cache (clé ci-dessous) : on ne relit jamais deux fois les
// mêmes évènements, et le premier passage ne remonte qu'une heure en arrière.

import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhone } from "./delivery-context"

const RECEIVED_WHATSAPP_METRIC = "WNzZPH" // id stable du compte FR, relevé le 24/07/2026
const HWM_KEY = "fr:klaviyo:whatsapp_delivered_hwm"
const WATCH_HOURS = 26 // fenêtre de service 24 h + marge — garder synchro avec le cron
const MAX_PAGES = 3 // 3 × 200 évènements par tour : au-delà, le tour suivant rattrape

type KlaviyoEventsPage = {
  data?: Array<{
    attributes?: { datetime?: string }
    relationships?: { profile?: { data?: { id?: string } } }
  }>
  included?: Array<{ id: string; attributes?: { phone_number?: string | null } }>
  links?: { next?: string | null }
}

async function fetchEventsPage(url: string): Promise<KlaviyoEventsPage | null> {
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

/**
 * Un passage de seed : évènements « Received WhatsApp » depuis le dernier passage
 * -> upsert des destinataires dans whatsapp_watchlist. Retourne le nombre ajouté/rafraîchi.
 */
export async function seedWatchlistFromDelivered(db: SupabaseClient): Promise<{
  seeded: number
  errors: string[]
}> {
  const errors: string[] = []

  const { data: cached } = await db
    .from("data_cache")
    .select("data")
    .eq("key", HWM_KEY)
    .maybeSingle()
  // Premier passage : une heure en arrière seulement — pas de backfill de l'historique.
  const hwm: string =
    (cached?.data as { hwm?: string } | null)?.hwm ??
    new Date(Date.now() - 3600_000).toISOString()

  const filter = encodeURIComponent(
    `and(equals(metric_id,"${RECEIVED_WHATSAPP_METRIC}"),greater-than(datetime,${hwm}))`
  )
  let url: string | null =
    `https://a.klaviyo.com/api/events?filter=${filter}` +
    `&include=profile&fields[profile]=phone_number&fields[event]=datetime` +
    `&sort=datetime&page[size]=200`

  const rows = new Map<string, { phone: string }>()
  let maxSeen = hwm

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const json = await fetchEventsPage(url)
    if (!json) {
      errors.push("Events API injoignable pendant le seed")
      break
    }
    const phones = new Map(
      (json.included || []).map((p) => [p.id, p.attributes?.phone_number ?? null])
    )
    for (const event of json.data || []) {
      const profileId = event.relationships?.profile?.data?.id
      const at = event.attributes?.datetime
      if (at && at > maxSeen) maxSeen = at
      if (!profileId) continue
      const phone = phones.get(profileId)
      if (!phone) continue // sans numéro on ne peut ni rattacher ni suivre
      rows.set(profileId, { phone: normalizePhone(phone) })
    }
    url = json.links?.next ?? null
  }

  if (rows.size > 0) {
    const watchUntil = new Date(Date.now() + WATCH_HOURS * 3600_000).toISOString()
    const { error } = await db.from("whatsapp_watchlist").upsert(
      Array.from(rows.entries()).map(([klaviyo_profile_id, { phone }]) => ({
        klaviyo_profile_id,
        phone,
        reason: "delivered",
        watch_until: watchUntil,
      })),
      { onConflict: "klaviyo_profile_id" }
    )
    if (error) errors.push(`upsert watchlist: ${error.message}`)
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

  return { seeded: rows.size, errors }
}
