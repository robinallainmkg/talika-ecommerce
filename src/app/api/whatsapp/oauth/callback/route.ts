// Retour d'autorisation OAuth Klaviyo : échange le code contre les tokens et les range
// dans data_cache (`fr:klaviyo:oauth_tokens`). Le refresh token vit en base, pas en env :
// pas de redéploiement à chaque (ré)autorisation, et une éventuelle rotation du refresh
// token est réécrite au même endroit par getAccessToken().
// Aucun secret n'est affiché dans la réponse.

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { OAUTH_TOKENS_KEY } from "@/lib/chat/whatsapp/klaviyo-conversations"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const page = (title: string, body: string, ok: boolean) =>
  new NextResponse(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F7F4ED">
     <div style="max-width:480px;text-align:center">
       <h1 style="color:${ok ? "#0A7A44" : "#B3261E"};font-size:20px">${title}</h1>
       <p style="color:#444">${body}</p>
     </div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const oauthError = url.searchParams.get("error")
  if (oauthError) {
    return page("Autorisation refusée", `Klaviyo a répondu : ${oauthError} — ${url.searchParams.get("error_description") ?? ""}`, false)
  }
  if (!code || !state) return page("Paramètres manquants", "code ou state absent du retour Klaviyo.", false)

  const clientId = process.env.KLAVIYO_OAUTH_CLIENT_ID
  const clientSecret = process.env.KLAVIYO_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return page("Configuration incomplète", "Variables KLAVIYO_OAUTH_* absentes côté serveur.", false)

  const db = chatDb()
  const stateKey = `fr:klaviyo:oauth_state:${state}`
  const { data: stored } = await db.from("data_cache").select("data").eq("key", stateKey).maybeSingle()
  const verifier = (stored?.data as { verifier?: string } | null)?.verifier
  if (!verifier) return page("Session expirée", "State inconnu ou expiré — relancer /api/whatsapp/oauth/start.", false)
  await db.from("data_cache").delete().eq("key", stateKey)

  const redirectUri = `https://${url.host}/api/whatsapp/oauth/callback`
  const tokenResponse = await fetch("https://a.klaviyo.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    cache: "no-store",
  })
  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text()
    return page("Échange de token refusé", `Klaviyo ${tokenResponse.status} : ${detail.slice(0, 300)}`, false)
  }
  const tokens = (await tokenResponse.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
  if (!tokens.refresh_token) return page("Réponse inattendue", "Pas de refresh_token dans la réponse Klaviyo.", false)

  const { error } = await db.from("data_cache").upsert(
    {
      key: OAUTH_TOKENS_KEY,
      data: {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token ?? null,
        access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scope: tokens.scope ?? null,
        authorized_at: new Date().toISOString(),
      },
      source: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  )
  if (error) return page("Stockage impossible", error.message, false)

  return page(
    "OAuth Klaviyo connecté ✓",
    "Le Companion peut maintenant répondre sur WhatsApp (dans la fenêtre de 24 h). Vous pouvez fermer cet onglet.",
    true
  )
}
