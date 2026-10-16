/**
 * GET /api/outreach/messages — lecture du fil de la boîte créatrices (table influence_messages)
 * pour un agent cloud. Protégé comme le cron : `Authorization: Bearer <CRON_SECRET>`.
 *
 * Query : ?market=UK|US|FR  ?since=<ISO>  ?limit=50 (≤ 200)  ?email=<adresse> (from OU to)
 *         ?influencer_id=<uuid>  ?direction=in|out
 * Tri : sent_at desc. Lecture seule — ne déclenche NI scan IMAP NI envoi (le scan IMAP reste
 * `GET /api/cron/outreach?scan=1`, qui remplit cette table pour les expéditrices connues).
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { MARKETS } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel -> jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status })

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return bad("Unauthorized", 401)
  try {
    const p = new URL(request.url).searchParams
    const market = (p.get("market") || "").toUpperCase()
    if (market && !(MARKETS as readonly string[]).includes(market)) return bad(`market : ${MARKETS.join(" | ")}`)
    const since = p.get("since")
    if (since && Number.isNaN(Date.parse(since))) return bad("since : date ISO attendue")
    const limitRaw = p.get("limit")
    const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return bad(`limit : entier entre 1 et ${MAX_LIMIT}`)
    const email = (p.get("email") || "").trim().toLowerCase()
    if (email && !EMAIL_RE.test(email)) return bad("email invalide")
    const influencerId = p.get("influencer_id")
    if (influencerId && !UUID_RE.test(influencerId)) return bad("influencer_id : uuid attendu")
    const direction = p.get("direction")
    if (direction && direction !== "in" && direction !== "out") return bad("direction : in | out")

    let q = supabase
      .from("influence_messages")
      .select("id, influencer_id, market, mailbox, direction, source, message_id, in_reply_to, references_ids, provider_id, from_email, to_email, subject, body_text, sent_at, created_at")
      .order("sent_at", { ascending: false })
      .limit(limit)
    if (market) q = q.eq("market", market)
    if (since) q = q.gte("sent_at", new Date(since).toISOString())
    if (influencerId) q = q.eq("influencer_id", influencerId)
    if (direction) q = q.eq("direction", direction)
    if (email) q = q.or(`from_email.ilike.${email},to_email.ilike.${email}`)

    const { data, error } = await q
    if (error) return bad(error.message, 500)
    return NextResponse.json({
      ok: true, count: (data || []).length, limit,
      filters: { market: market || null, since: since || null, email: email || null, influencer_id: influencerId || null, direction: direction || null },
      messages: data || [],
    })
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Failed", 500)
  }
}
