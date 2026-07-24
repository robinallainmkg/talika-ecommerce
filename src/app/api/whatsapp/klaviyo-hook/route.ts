// Webhook Klaviyo `event:klaviyo.received_whatsapp` -> alimente la watchlist de polling.
//
// Pourquoi ce détour : ce topic signale un message DÉLIVRÉ à la cliente, pas une réponse.
// Klaviyo n'expose aucun webhook pour un message entrant (topics du compte relevés le
// 24/07/2026 ; la doc Conversations le confirme : « you will need to poll »).
// On s'en sert donc comme déclencheur : quiconque vient de recevoir un WhatsApp est
// susceptible de répondre dans les heures qui suivent -> on le met sous surveillance 26 h.

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { normalizePhone } from "@/lib/chat/whatsapp/delivery-context"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const WATCH_HOURS = 26 // 24 h de fenêtre de service + marge

export async function POST(request: Request) {
  // Klaviyo signe ses webhooks ; à défaut on exige un secret partagé passé en query
  // (le même mécanisme que les autres crons du Companion).
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-webhook-secret")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload) return NextResponse.json({ error: "payload illisible" }, { status: 400 })

  // Klaviyo envoie soit un objet, soit un tableau d'évènements selon la config du webhook.
  const events: Array<Record<string, unknown>> = Array.isArray(payload) ? payload : [payload]

  const rows: Array<{ klaviyo_profile_id: string; phone: string; reason: string; watch_until: string }> = []
  for (const event of events) {
    const profileId =
      (event.profile_id as string) ||
      ((event.profile as Record<string, string> | undefined)?.id ?? null)
    const rawPhone =
      ((event.profile as Record<string, string> | undefined)?.phone_number as string) ||
      ((event.event_properties as Record<string, string> | undefined)?.["To Number"] as string) ||
      null
    if (!profileId || !rawPhone) continue
    rows.push({
      klaviyo_profile_id: profileId,
      phone: normalizePhone(rawPhone),
      reason: "delivered",
      watch_until: new Date(Date.now() + WATCH_HOURS * 3600_000).toISOString(),
    })
  }

  if (rows.length === 0) return NextResponse.json({ watched: 0, skipped: events.length })

  const db = chatDb()
  const { error } = await db
    .from("whatsapp_watchlist")
    .upsert(rows, { onConflict: "klaviyo_profile_id" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ watched: rows.length })
}
