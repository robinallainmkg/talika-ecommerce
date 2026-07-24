// Ingestion WhatsApp entrant -> fils dans le chat back-office.
// Appelé toutes les 2 min par pg_cron (Supabase) — cf docs/whatsapp-inbound.md.
//
// v2 (24/07/2026 soir, après le test réel) : le message entrant est un ÉVÈNEMENT Klaviyo
// (métrique « Sent WhatsApp », corps complet inclus) — l'architecture watchlist + polling
// par profil de la v1 est supprimée, remplacée par un balayage d'évènements avec
// high-water mark. ~2-3 appels API par tour, quel que soit le volume de campagnes.
//
// ⚠️ Ce cron n'envoie JAMAIS de message. Il lit, rattache la commande, alimente le fil.
// L'envoi est une action humaine explicite (POST .../reply-whatsapp, confirmed:true).

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { ingestInboundWhatsapp } from "@/lib/chat/whatsapp/ingest-inbound"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-cron-secret")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!process.env.KLAVIYO_API_KEY) {
    return NextResponse.json({ error: "KLAVIYO_API_KEY absente" }, { status: 503 })
  }

  const result = await ingestInboundWhatsapp(chatDb())
  return NextResponse.json({
    inbound: result.inbound,
    autoResponses: result.autoResponses,
    newConversations: result.newConversations,
    errors: result.errors.slice(0, 10),
  })
}
