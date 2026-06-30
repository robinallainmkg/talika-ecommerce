import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  mergeTemplate, htmlWrap, injectPixel, sendOutreach, outreachConfigured,
  appBaseUrl, defaultState, type OutreachState,
} from "@/lib/influence/outreach"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Inf { id: string; name: string; instagram_handle: string | null; email: string | null; metadata: Record<string, unknown> | null }
const firstName = (n: string) => (n || "there").trim().split(/\s+/)[0].replace(/[(),]/g, "")

// POST { influencer_ids:[], subject, body, dry? } — envoie un message composé (template
// éditable + variables fusionnées par destinataire). DRY par défaut.
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b.influencer_ids) ? b.influencer_ids : []
  const subjectTpl: string = (b.subject || "").toString()
  const bodyTpl: string = (b.body || "").toString()
  const dry = b.dry !== false
  const sender = process.env.OUTREACH_SENDER || "Robin · Talika UK"

  if (!ids.length || !bodyTpl.trim()) {
    return NextResponse.json({ error: "influencer_ids et body requis" }, { status: 400 })
  }
  if (!dry && !outreachConfigured()) {
    return NextResponse.json({ error: "Canal mail non configuré (SMTP/Resend + OUTREACH_FROM)." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("influencers").select("id,name,instagram_handle,email,metadata").in("id", ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const results: { id: string; name: string; email: string | null; result: string; detail?: string }[] = []
  let sent = 0

  for (const inf of (data || []) as Inf[]) {
    const email = (inf.email || "").trim()
    if (!email || !email.includes("@")) {
      results.push({ id: inf.id, name: inf.name, email: inf.email, result: "skip", detail: "email manquant" })
      continue
    }
    const st = (inf.metadata?.outreach as OutreachState) || defaultState()
    const vars: Record<string, string> = {
      first_name: firstName(inf.name),
      name: inf.name || "",
      handle: (inf.instagram_handle || "").replace(/^@/, ""),
      sender,
      personalisation: st.personalisation || "",
    }
    const subject = mergeTemplate(subjectTpl, vars)
    const text = mergeTemplate(bodyTpl, vars)
    const html = injectPixel(htmlWrap(text), inf.id, 1, appBaseUrl())

    let status = "dry", provider: string | undefined, errMsg: string | undefined
    if (!dry) {
      const r = await sendOutreach(email, subject, html, text)
      status = r.ok ? "sent" : "error"; provider = r.id; errMsg = r.error
    }
    await supabase.from("outreach_log").insert({
      influencer_id: inf.id, market: "UK", step: 1, channel: "email",
      to_email: email, subject, status, provider_id: provider || null, error: errMsg || null,
    })
    // Envoi réel : on marque "contactée" pour stopper le step1 auto du drip.
    if (status === "sent") {
      const next: OutreachState = {
        ...st,
        status: st.status === "À contacter" || st.status === "À qualifier" ? "Étape 1 envoyée" : st.status,
        step: Math.max(st.step || 0, 1),
        sent: { ...st.sent, ...(st.sent?.["1"] ? {} : { "1": now.toISOString() }) },
      }
      await supabase.from("influencers").update({ metadata: { ...(inf.metadata || {}), outreach: next }, updated_at: now.toISOString() }).eq("id", inf.id)
      sent++
    } else if (status === "dry") {
      sent++
    }
    results.push({ id: inf.id, name: inf.name, email, result: status, detail: errMsg })
  }

  return NextResponse.json({ dry, attempted: results.length, sent, results })
}
