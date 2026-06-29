import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizeMarket } from "@/lib/market"
import {
  dueStep, renderStep, sendOutreach, outreachConfigured, defaultState,
  DAILY_CAP, TERMINAL, type OutreachState, type OutreachStatus,
} from "@/lib/influence/outreach"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Influencer {
  id: string; name: string; instagram_handle: string | null; email: string | null
  tier: string | null; category: string | null
  metadata: Record<string, unknown> | null
}

const stateOf = (inf: Influencer): OutreachState =>
  ((inf.metadata?.outreach as OutreachState) || defaultState())

const firstName = (name: string) => (name || "there").trim().split(/\s+/)[0].replace(/[(),]/g, "")

async function saveState(inf: Influencer, st: OutreachState) {
  const metadata = { ...(inf.metadata || {}), outreach: st }
  await supabase.from("influencers").update({ metadata, updated_at: new Date().toISOString() }).eq("id", inf.id)
}

// GET — liste outreach d'un marché + étape due par contact + compteurs
export async function GET(request: Request) {
  const market = normalizeMarket(new URL(request.url).searchParams.get("market"))
  const { data, error } = await supabase
    .from("influencers")
    .select("id,name,instagram_handle,email,tier,category,metadata")
    .eq("market", market)
    .order("name", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const rows = (data as Influencer[]).map((inf) => {
    const st = stateOf(inf)
    return {
      id: inf.id, name: inf.name, instagram_handle: inf.instagram_handle,
      email: inf.email, tier: inf.tier, category: inf.category,
      outreach: st, due: dueStep(st, now),
    }
  })
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.outreach.status] = (counts[r.outreach.status] || 0) + 1

  return NextResponse.json({
    market, configured: outreachConfigured(),
    total: rows.length,
    due: rows.filter((r) => r.due).length,
    counts, rows,
  })
}

// POST { action:"send", ids?, dry?, max?, market? } — envoie l'étape DUE (DRY par défaut)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const market = normalizeMarket(body.market)
  const dry = body.dry !== false                       // sécurité : DRY sauf dry:false explicite
  const max = Number(body.max) || DAILY_CAP
  const sender = process.env.OUTREACH_SENDER || "Robin · Talika UK"

  if (!dry && !outreachConfigured()) {
    return NextResponse.json(
      { error: "Resend non configuré : il faut RESEND_API_KEY + OUTREACH_FROM (ou RESEND_FROM) sur companion-ecommerce.com." },
      { status: 400 }
    )
  }

  let q = supabase
    .from("influencers")
    .select("id,name,instagram_handle,email,tier,category,metadata")
    .eq("market", market)
    .order("name", { ascending: true })
  if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const results: { name: string; email: string | null; step?: number; result: string; detail?: string }[] = []
  let sent = 0

  for (const inf of data as Influencer[]) {
    if (sent >= max) break
    const st = stateOf(inf)
    if (TERMINAL.includes(st.status)) continue
    const step = dueStep(st, now)
    if (!step) continue
    const email = (inf.email || "").trim()
    const estat = (st.email_status || "").toLowerCase()
    if (!email || !email.includes("@") || estat.includes("sourcer")) {
      results.push({ name: inf.name, email: inf.email, result: "skip", detail: "email manquant / à sourcer" })
      continue
    }

    const { subject, text, html } = renderStep(step, {
      first_name: firstName(inf.name), personalisation: st.personalisation, sender,
    })

    let status = "dry", provider: string | undefined, errMsg: string | undefined
    if (!dry) {
      const r = await sendOutreach(email, subject, html, text)
      status = r.ok ? "sent" : "error"
      provider = r.id; errMsg = r.error
    }

    await supabase.from("outreach_log").insert({
      influencer_id: inf.id, market, step, channel: "email",
      to_email: email, subject, status, provider_id: provider || null, error: errMsg || null,
    })

    if (status === "sent" || status === "dry") {
      const newStatus = (`Étape ${step} envoyée`) as OutreachStatus
      const next: OutreachState = {
        ...st, status: dry ? st.status : newStatus,
        step: dry ? st.step : step,
        sent: dry ? st.sent : { ...st.sent, [String(step)]: now.toISOString() },
      }
      if (!dry) await saveState(inf, next)
      sent++
    }
    results.push({ name: inf.name, email, step, result: status, detail: errMsg })
  }

  return NextResponse.json({ market, dry, attempted: results.length, sent, results })
}

// PATCH { id, status?, replied?, reply_summary?, personalisation?, email_status? }
// Utilisé par l'UI et par la routine Gmail (détection des réponses).
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: inf, error } = await supabase
    .from("influencers").select("id,name,instagram_handle,email,tier,category,metadata").eq("id", body.id).single()
  if (error || !inf) return NextResponse.json({ error: error?.message || "introuvable" }, { status: 404 })

  const st = stateOf(inf as Influencer)
  if (body.replied) {
    st.status = "Répondu"
    st.replied_at = new Date().toISOString()
    if (body.reply_summary) st.reply_summary = body.reply_summary
  }
  if (body.status) st.status = body.status as OutreachStatus
  if (body.personalisation !== undefined) st.personalisation = body.personalisation
  if (body.email_status !== undefined) st.email_status = body.email_status
  await saveState(inf as Influencer, st)
  return NextResponse.json({ ok: true, outreach: st })
}
