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

  // Anti-doublon INDÉPENDANT du metadata : outreach_log = source de vérité.
  // (Incident 03/07 : sous saturation DB, les updates metadata échouaient en silence
  // → la même étape 1 renvoyée 3× aux mêmes personnes. Le log, lui, avait tout.)
  // FAIL-CLOSED : si on ne peut pas lire le log, on n'envoie RIEN.
  const since = new Date(now.getTime() - 30 * 86400000).toISOString()
  const { data: sentLog, error: logReadErr } = await supabase
    .from("outreach_log").select("influencer_id,step")
    .eq("channel", "email").eq("status", "sent").gte("created_at", since)
  if (logReadErr) throw new Error(`anti-doublon illisible (${logReadErr.message}) — batch annulé (fail-closed)`)
  const alreadySent = new Set((sentLog || []).map((r: { influencer_id: string; step: number }) => `${r.influencer_id}:${r.step}`))

  const results: BatchResult["results"] = []
  let sent = 0
  for (const inf of (data || []) as Inf[]) {
    if (sent >= max) break
    const st = stateOf(inf)
    if (TERMINAL.includes(st.status)) continue
    const step = dueStep(st, now)
    if (!step) continue
    if (alreadySent.has(`${inf.id}:${step}`)) {
      // Déjà envoyé selon le log mais metadata en retard → on répare l'état, sans renvoyer.
      const repaired: OutreachState = {
        ...st, status: (`Étape ${step} envoyée`) as OutreachStatus,
        step: Math.max(st.step || 0, step),
        sent: { ...st.sent, [String(step)]: st.sent?.[String(step)] || now.toISOString() },
      }
      await supabase.from("influencers")
        .update({ metadata: { ...(inf.metadata || {}), outreach: repaired }, updated_at: now.toISOString() }).eq("id", inf.id)
      await supabase.from("influence_campaign_collabs")
        .update({ stage: "contacte" }).eq("influencer_id", inf.id).eq("stage", "prospect")
      results.push({ name: inf.name, email: inf.email, step, result: "skip", detail: "déjà envoyé (log) — état réparé" })
      continue
    }
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
    const { error: logErr } = await supabase.from("outreach_log").insert({
      influencer_id: inf.id, market: opts.market, step, channel: "email",
      to_email: email, subject, status, provider_id: provider || null, error: errMsg || null,
    })
    let persistErr: { message: string } | null = null
    if (status === "sent") {
      alreadySent.add(`${inf.id}:${step}`)
      // Pipeline kanban : la carte passe Prospect → Contacté automatiquement (best-effort).
      await supabase.from("influence_campaign_collabs")
        .update({ stage: "contacte" }).eq("influencer_id", inf.id).eq("stage", "prospect")
      const next: OutreachState = {
        ...st, status: (`Étape ${step} envoyée`) as OutreachStatus, step,
        sent: { ...st.sent, [String(step)]: now.toISOString() },
      }
      const res = await supabase.from("influencers")
        .update({ metadata: { ...(inf.metadata || {}), outreach: next }, updated_at: now.toISOString() }).eq("id", inf.id)
      persistErr = res.error
    }
    if (status === "sent" || status === "dry") sent++
    results.push({ name: inf.name, email, step, result: status, detail: errMsg })
    // FAIL-CLOSED : si l'état ne se persiste plus (log OU metadata), on ARRÊTE le batch —
    // continuer = envoyer à l'aveugle. Le dédoublonnage par log protège le run suivant.
    if (status === "sent" && (persistErr || logErr)) {
      results.push({ name: inf.name, email, step, result: "abort", detail: `écriture état échouée (${(persistErr || logErr)!.message}) — batch stoppé` })
      break
    }
  }
  return { attempted: results.length, sent, results }
}
