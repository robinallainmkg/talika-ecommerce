// Démarre l'autorisation OAuth Klaviyo (PKCE) pour l'app « Companion ».
// GET /api/whatsapp/oauth/start?secret=<CRON_SECRET> -> redirige vers l'écran
// d'autorisation Klaviyo. Le code_verifier attend le retour dans data_cache
// (les deux étapes ne tombent pas sur la même lambda).

import { NextResponse } from "next/server"
import { randomBytes, createHash } from "node:crypto"
import { chatDb } from "@/lib/chat/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const SCOPES = "accounts:read conversations:read conversations:write profiles:read"

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const clientId = process.env.KLAVIYO_OAUTH_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: "KLAVIYO_OAUTH_CLIENT_ID absente" }, { status: 503 })

  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash("sha256").update(verifier).digest())

  const { error } = await chatDb().from("data_cache").upsert(
    {
      key: `fr:klaviyo:oauth_state:${state}`,
      data: { verifier },
      source: "manual",
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    { onConflict: "key" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const redirectUri = `https://${url.host}/api/whatsapp/oauth/callback`
  const authorize = new URL("https://www.klaviyo.com/oauth/authorize")
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("client_id", clientId)
  authorize.searchParams.set("redirect_uri", redirectUri)
  authorize.searchParams.set("scope", SCOPES)
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("code_challenge", challenge)
  authorize.searchParams.set("code_challenge_method", "S256")

  return NextResponse.redirect(authorize.toString())
}
