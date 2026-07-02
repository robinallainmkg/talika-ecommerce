// Logique d'envoi d'un batch outreach — partagée entre l'API (clic UI) et le cron.
// DRY par défaut : n'envoie réellement que si dry === false.
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  dueStep, renderStep, sendOutreach, defaultState,
  DAILY_CAP, TERMINAL, type OutreachState, type OutreachStatus,
} from "@/lib/influence/outreach"

interface Inf {
  id: string; name: string; email: string | null
  metadata: Record<string, unknown> | null
}
const stateOf = (inf: Inf): OutreachState => ((inf.metadata?.outreach as OutreachState) || defaultState())
const firstName = (name: string) => (name || "there").trim().split(/\s+/)[0].replace(/[(),]/g, "")

export interface BatchOpts {
  market: string
  ids?: string[]
  dry?: boolean
  max?: number
  sender?: string
  baseUrl?: string
}
export interface BatchResult {
  attempted: number; sent: number
  results: { name: string; email: string | null; step?: number; result: string; detail?: string }[]
}

export async function sendDueBatch(supabase: SupabaseClient, opts: BatchOpts): Promise<BatchResult> {
  const dry = opts.dry !== false
  const max = opts.max || DAILY_CAP
  const sender = opts.sender || process.env.OUTREACH_SENDER || "Robin · Talika UK"
  const now = new Date()

  let q = supabase
    .from("influencers")
    .select("id,name,email,metadata")
    .eq("market", opts.market)
    .order("name", { ascending: true })
  if (opts.ids?.length) q = q.in("id", opts.ids)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const results: BatchResult["results"] = []
  let sent = 0
  for (const inf of (data || []) as Inf[]) {
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
    const { subject, text } = renderStep(step, { first_name: firstName(inf.name), personalisation: st.personalisation, sender })

    let status = "dry", provider: string | undefined, errMsg: string | undefined
    if (!dry) {
      const r = await sendOutreach(email, subject, text)
      status = r.ok ? "sent" : "error"; provider = r.id; errMsg = r.error
    }
    await supabase.from("outreach_log").insert({
      influencer_id: inf.id, market: opts.market, step, channel: "email",
      to_email: email, subject, status, provider_id: provider || null, error: errMsg || null,
    })
    if (status === "sent") {
      // Pipeline kanban : la carte passe Prospect → Contacté automatiquement.
      await supabase.from("influence_campaign_collabs")
        .update({ stage: "contacte" }).eq("influencer_id", inf.id).eq("stage", "prospect")
      const next: OutreachState = {
        ...st, status: (`Étape ${step} envoyée`) as OutreachStatus, step,
        sent: { ...st.sent, [String(step)]: now.toISOString() },
      }
      await supabase.from("influencers").update({ metadata: { ...(inf.metadata || {}), outreach: next }, updated_at: now.toISOString() }).eq("id", inf.id)
    }
    if (status === "sent" || status === "dry") sent++
    results.push({ name: inf.name, email, step, result: status, detail: errMsg })
  }
  return { attempted: results.length, sent, results }
}
