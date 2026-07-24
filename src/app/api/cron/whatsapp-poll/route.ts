// Polling des conversations WhatsApp Klaviyo -> crée/complète un fil dans le chat back-office.
// À appeler toutes les 2 minutes (Supabase pg_cron + pg_net, cf docs/whatsapp-inbound.md).
// Une fois par jour, l'appeler avec `?sweep=1` : re-sonde les fils WhatsApp existants dont
// la surveillance est finie — une cliente qui répond APRÈS les 26 h de watchlist serait
// sinon perdue à jamais (limite structurelle du polling ; le sweep la réduit à ≤ 24 h).
//
// Budget d'appels : l'API Conversations est en tier SMALL (3 req/s en burst, 60 req/min
// en régime). La boucle est THROTTLÉE à ~1 appel/1,1 s -> ~54 req/min, sous le plafond.
// (Un `for` sans pause ne « s'étale » pas sur les 2 min : il tirerait ~150 req/min.)
//
// ⚠️ Ce cron n'envoie JAMAIS de message. Il lit, rattache la commande, et alimente le fil.
// L'envoi est une action humaine explicite (POST .../reply-whatsapp, confirmed:true).

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import {
  getWhatsappConversation,
  isConversationsConfigured,
} from "@/lib/chat/whatsapp/klaviyo-conversations"
import { buildDeliveryContext } from "@/lib/chat/whatsapp/delivery-context"
import { seedWatchlistFromDelivered } from "@/lib/chat/whatsapp/seed-watchlist"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const MAX_POLLS_PER_RUN = 100 // 100 × 1,1 s de throttle ≈ 110 s, sous maxDuration
const POLL_SPACING_MS = 1100 // ~54 req/min, sous le tier SMALL (60 req/min)
const WATCH_HOURS = 26 // même valeur que le hook (klaviyo-hook/route.ts) — garder synchro

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** ISO sûr : l'API peut omettre le timestamp (champ non confirmé) — jamais d'Invalid Date. */
function safeIso(value: string | null | undefined): string {
  if (!value) return new Date().toISOString()
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString()
}

/** Cadence décroissante : minutes à attendre avant le prochain sondage, selon l'âge du suivi. */
function nextDelayMinutes(ageMinutes: number): number {
  if (ageMinutes < 90) return 5 // la fenêtre chaude : ~18 sondages
  if (ageMinutes < 8 * 60) return 30 // ~13 sondages
  return 120 // ~9 sondages jusqu'à 26 h
}

type PollEntry = {
  klaviyo_profile_id: string
  phone: string | null
  last_message_id: string | null
  poll_count: number
  in_watchlist: boolean
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-cron-secret")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  // Lecture : la clé privée suffit (testé 200 le 24/07/2026) ; OAuth requis seulement pour l'envoi.
  if (!isConversationsConfigured() && !process.env.KLAVIYO_API_KEY) {
    return NextResponse.json({ error: "Aucune auth Klaviyo configurée", polled: 0 }, { status: 503 })
  }
  const sweep = url.searchParams.get("sweep") === "1"

  const db = chatDb()
  const now = Date.now()

  // Alimentation de la watchlist depuis la métrique « Received WhatsApp » (délivré).
  // Remplace le webhook prévu initialement : sa création exige Advanced KDP (403, testé
  // le 24/07/2026). Latence = un tour de cron, ce qui suffit largement.
  const seed = await seedWatchlistFromDelivered(db)

  const { data: watched, error } = await db
    .from("whatsapp_watchlist")
    .select("klaviyo_profile_id, phone, watch_until, last_polled_at, poll_count, last_message_id")
    .gt("watch_until", new Date(now).toISOString())
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .limit(MAX_POLLS_PER_RUN * 3)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due: PollEntry[] = (watched || [])
    .filter((w) => {
      if (!w.last_polled_at) return true
      // Âge déduit de watch_until, que le hook REPOUSSE à chaque message délivré : une
      // cliente re-contactée redevient « chaude » (created_at, lui, reste figé au premier
      // contact et condamnerait sa cadence à 2 h).
      const ageMinutes = Math.max(0, WATCH_HOURS * 60 - (new Date(w.watch_until).getTime() - now) / 60_000)
      const sinceLast = (now - new Date(w.last_polled_at).getTime()) / 60_000
      return sinceLast >= nextDelayMinutes(ageMinutes)
    })
    .map((w) => ({
      klaviyo_profile_id: w.klaviyo_profile_id,
      phone: w.phone,
      last_message_id: w.last_message_id,
      poll_count: w.poll_count,
      in_watchlist: true,
    }))

  // Mode sweep (1×/jour) : fils WhatsApp connus, sortis de la watchlist, re-sondés.
  if (sweep) {
    const activeIds = new Set((watched || []).map((w) => w.klaviyo_profile_id))
    const { data: dormant } = await db
      .from("chat_conversations")
      .select("klaviyo_profile_id, visitor_phone")
      .eq("channel", "whatsapp")
      .not("klaviyo_profile_id", "is", null)
      .gt("last_message_at", new Date(now - 30 * 864e5).toISOString())
      .limit(500)
    for (const c of dormant || []) {
      if (!c.klaviyo_profile_id || activeIds.has(c.klaviyo_profile_id)) continue
      activeIds.add(c.klaviyo_profile_id) // dédoublonne les fils multiples d'un même profil
      due.push({
        klaviyo_profile_id: c.klaviyo_profile_id,
        phone: c.visitor_phone,
        last_message_id: null,
        poll_count: 0,
        in_watchlist: false,
      })
    }
  }

  const batch = due.slice(0, MAX_POLLS_PER_RUN)
  let newMessages = 0
  let newConversations = 0
  const errors: string[] = []

  for (const entry of batch) {
    try {
      const conversation = await getWhatsappConversation(entry.klaviyo_profile_id)
      if (entry.in_watchlist) {
        await db
          .from("whatsapp_watchlist")
          .update({ last_polled_at: new Date().toISOString(), poll_count: entry.poll_count + 1 })
          .eq("klaviyo_profile_id", entry.klaviyo_profile_id)
      }

      if (!conversation) continue

      // Ordre chronologique JAMAIS supposé (API non testée) : on trie nous-mêmes.
      const messages = [...conversation.messages].sort((a, b) =>
        safeIso(a.createdAt) < safeIso(b.createdAt) ? -1 : 1
      )
      // Une conversation Klaviyo n'existe QUE si la cliente a écrit au moins une fois
      // (pas de création par API). Son existence est donc en soi le signal « elle a répondu »,
      // même si l'API ne rend pas (encore) les corps de messages — cas spec 2026-07-15,
      // où les attributs se limitent à `channel`.
      const inbound = messages.filter((m) => m.direction === "inbound")
      const bodiesAvailable = messages.length > 0
      const latest = bodiesAvailable
        ? inbound[inbound.length - 1] ?? null
        : { id: `conv_${conversation.id}`, body: "", createdAt: new Date().toISOString() }
      if (!latest) continue // que du sortant : rien à remonter
      if (entry.in_watchlist && latest.id === entry.last_message_id) continue // rien de neuf

      // Le fil existe-t-il déjà côté back-office ?
      const { data: existing } = await db
        .from("chat_conversations")
        .select("id, status, unread_count, message_count")
        .eq("klaviyo_conversation_id", conversation.id)
        .maybeSingle()

      let conversationId = existing?.id as string | undefined
      const latestAt = safeIso(latest.createdAt)

      if (!conversationId) {
        if (!entry.phone) continue // sans téléphone, aucun rattachement possible
        // Premier message : on rattache la commande AVANT de créer le fil,
        // pour que le drawer soit exploitable dès la première ouverture.
        const context = await buildDeliveryContext(entry.phone)
        const { data: created, error: insertError } = await db
          .from("chat_conversations")
          .insert({
            token: `wa_${conversation.id}`,
            channel: "whatsapp",
            market: "FR",
            // `queued` = « un client attend un humain » : le fil entre dans « À traiter »
            // et déclenche l'alerte du back-office (qui ne sonne que pour un fil queued
            // nouveau — un fil créé en `human` serait silencieux). Aucun risque de bot :
            // le bot ne répond que via le widget du site (/api/chat/message), dont le
            // token n'est jamais remis à un navigateur pour un fil WhatsApp.
            status: "queued",
            visitor_phone: entry.phone,
            visitor_email: context.email,
            visitor_name: context.firstName,
            klaviyo_profile_id: entry.klaviyo_profile_id,
            klaviyo_conversation_id: conversation.id,
            customer_orders_count: context.ordersLifetime,
            last_message_at: latestAt,
          })
          .select("id")
          .single()
        if (insertError) {
          errors.push(`insert ${entry.klaviyo_profile_id}: ${insertError.message}`)
          continue
        }
        conversationId = created.id
        newConversations++
      }

      // Rejoue tout l'historique ; l'index unique sur external_id absorbe les doublons
      // (ignoreDuplicates -> seules les lignes réellement INSÉRÉES reviennent du select).
      // Si les corps ne sont pas exposés par l'API, on pose un message système : le fil
      // apparaît dans /chat avec le dossier commande, et renvoie vers l'inbox Klaviyo.
      const rows = bodiesAvailable
        ? messages.map((m) => ({
            conversation_id: conversationId,
            external_id: `wa_${m.id}`,
            role: m.direction === "inbound" ? "user" : "agent",
            content: m.body,
            created_at: safeIso(m.createdAt),
          }))
        : [
            {
              conversation_id: conversationId,
              external_id: `wa_${latest.id}`,
              role: "system",
              content:
                "La cliente a écrit sur WhatsApp — corps du message non exposé par l'API Klaviyo, à lire dans l'inbox Klaviyo.",
              created_at: latestAt,
            },
          ]
      const { data: inserted } = await db
        .from("chat_messages")
        .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true })
        .select("id, role")
      const insertedCount = inserted?.length ?? 0
      const newInbound = (inserted || []).filter((m) => m.role !== "agent").length
      newMessages += insertedCount
      // Fil connu et rien d'inséré (cas sweep surtout) : ne pas toucher aux compteurs
      // ni rallumer un fil que l'équipe a déjà lu/fermé.
      if (existing && insertedCount === 0) continue

      const windowExpiry = new Date(new Date(latestAt).getTime() + 24 * 3600_000).toISOString()
      await db
        .from("chat_conversations")
        .update({
          last_message_at: latestAt,
          service_window_expires_at: windowExpiry,
          // Compteurs INCRÉMENTAUX : on n'écrase pas le zéro posé par la lecture, et
          // message_count > 0 est ce qui rend le fil VISIBLE dans le back-office
          // (la liste filtre `message_count > 0` — un fil à 0 n'apparaît jamais).
          message_count: (existing?.message_count ?? 0) + insertedCount,
          unread_count: (existing?.unread_count ?? 0) + newInbound,
          // Un fil fermé qui reçoit une réponse doit REVENIR dans « À traiter »,
          // pas rester enterré dans « Fermés ». Un fil en `human` reste en `human`
          // (un agent l'a en charge ; l'alerte « nouveau message visiteur » suffit).
          ...(newInbound > 0 && existing?.status === "closed" ? { status: "queued" } : {}),
        })
        .eq("id", conversationId)

      // Elle a répondu : on (re)met sous surveillance rapprochée — une entrée sweep
      // réintègre ainsi la watchlist et retrouve la cadence de 5 min.
      if (newInbound > 0 && entry.phone) {
        await db.from("whatsapp_watchlist").upsert(
          {
            klaviyo_profile_id: entry.klaviyo_profile_id,
            phone: entry.phone,
            reason: "replied",
            watch_until: windowExpiry,
            last_message_id: latest.id,
            last_polled_at: new Date().toISOString(),
          },
          { onConflict: "klaviyo_profile_id" }
        )
      }
    } catch (err) {
      errors.push(`${entry.klaviyo_profile_id}: ${(err as Error).message}`)
    } finally {
      await sleep(POLL_SPACING_MS) // rate limit Klaviyo : jamais de rafale
    }
  }

  return NextResponse.json({
    seeded: seed.seeded,
    watched: watched?.length ?? 0,
    swept: sweep ? due.filter((d) => !d.in_watchlist).length : 0,
    polled: batch.length,
    newConversations,
    newMessages,
    errors: [...seed.errors, ...errors].slice(0, 10),
  })
}
