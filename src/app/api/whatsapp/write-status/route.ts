// Sonde d'activation de l'écriture Conversations (account-level enablement Klaviyo).
// GET ?secret=CRON_SECRET -> { enabled: boolean }
// Méthode : POST vers un id de conversation INEXISTANT avec le token OAuth.
//   403 permission_denied -> le compte n'est pas encore activé par Klaviyo.
//   autre chose (404/400 de validation) -> l'écriture est ouverte. RIEN ne peut partir :
//   l'id n'existe pas, Klaviyo rejette avant tout envoi.
// Utilisée par la routine quotidienne TALIKA FR KLAVIYO pour alerter Robin dès l'activation.

import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/chat/whatsapp/klaviyo-conversations"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret") || request.headers.get("x-cron-secret")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ enabled: false, reason: "OAuth non autorisé" })

  const response = await fetch("https://a.klaviyo.com/api/conversation-messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      revision: "2026-07-15",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        type: "conversation-message",
        attributes: { body: "probe" },
        relationships: { conversation: { data: { type: "conversation", id: "PROBE_ID_INEXISTANT" } } },
      },
    }),
    cache: "no-store",
  })
  const enabled = response.status !== 403
  return NextResponse.json({
    enabled,
    klaviyoStatus: response.status,
    checkedAt: new Date().toISOString(),
  })
}
