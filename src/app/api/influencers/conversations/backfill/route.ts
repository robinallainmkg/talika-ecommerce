import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { renderStep } from "@/lib/influence/outreach"
import { UK_MAILBOX, BODY_MAX } from "@/lib/influence/messages"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface LogRow {
  id: string; influencer_id: string; market: string | null; step: number | null
  channel: string; to_email: string | null; subject: string | null
  provider_id: string | null; created_at: string
}
interface Inf { id: string; name: string; email: string | null; metadata: Record<string, unknown> | null }

const firstName = (n: string) => (n || "there").trim().split(/\s+/)[0].replace(/[(),]/g, "")

/**
 * POST /api/influencers/conversations/backfill — one-shot, protégé par CRON_SECRET.
 * Reconstitue le fil influence_messages depuis outreach_log (idempotent, rejouable) :
 *  - envois drip (channel email/sent) → corps RE-RENDU depuis les templates (fidèle :
 *    templates inchangés depuis le lancement). Si le sujet du log ne correspond pas au
 *    template (= envoi "compose" au corps libre, non stocké) → stub sujet seul.
 *  - réponses (channel reply) → stub sujet seul, SEULEMENT si aucun message entrant
 *    n'est déjà archivé pour l'influenceuse à ±1 j (les vrais corps viennent du
 *    cron ?scan=1&limit=500, à lancer AVANT ce backfill).
 * Dédup par message_id 'backfill:<outreach_log.id>' (upsert ignoreDuplicates).
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const [{ data: logs, error: logErr }, { data: infs, error: infErr }] = await Promise.all([
      supabase.from("outreach_log")
        .select("id, influencer_id, market, step, channel, to_email, subject, provider_id, created_at")
        .in("channel", ["email", "reply"])
        .order("created_at", { ascending: true })
        .limit(5000),
      supabase.from("influencers").select("id, name, email, metadata"),
    ])
    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })
    if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })
    const byId = new Map<string, Inf>()
    for (const i of (infs || []) as Inf[]) byId.set(i.id, i)

    // Messages entrants déjà archivés (vrais corps IMAP) → on ne crée pas de stub doublon.
    const { data: existingIn } = await supabase
      .from("influence_messages").select("influencer_id, sent_at").eq("direction", "in")
    const inByInf = new Map<string, number[]>()
    for (const m of existingIn || []) {
      const arr = inByInf.get(m.influencer_id) || []
      arr.push(new Date(m.sent_at).getTime())
      inByInf.set(m.influencer_id, arr)
    }
    const DAY = 86_400_000
    const hasRealInboundNear = (infId: string, iso: string) =>
      (inByInf.get(infId) || []).some((t) => Math.abs(t - new Date(iso).getTime()) <= DAY)

    const rows: Record<string, unknown>[] = []
    let outRendered = 0, outStubs = 0, inStubs = 0, skipped = 0

    for (const log of (logs || []) as LogRow[]) {
      const inf = byId.get(log.influencer_id)
      if (!inf) { skipped++; continue }
      const market = log.market || "UK"

      if (log.channel === "email") {
        const to = log.to_email || inf.email
        if (!to) { skipped++; continue }
        // Re-rendu du template de l'étape ; sujet identique = drip → corps fidèle.
        let body: string | null = null
        const step = log.step === 1 || log.step === 2 || log.step === 3 ? log.step : null
        if (step) {
          const st = (inf.metadata?.outreach as { personalisation?: string } | undefined)
          const r = renderStep(step, {
            first_name: firstName(inf.name),
            personalisation: st?.personalisation,
            sender: process.env.OUTREACH_SENDER || "Robin · Talika UK",
          })
          if ((log.subject || "").trim() === r.subject.trim()) body = r.text
        }
        if (body) outRendered++; else outStubs++
        rows.push({
          influencer_id: inf.id, market, mailbox: UK_MAILBOX,
          direction: "out", source: "backfill",
          message_id: `backfill:${log.id}`,
          provider_id: log.provider_id,
          from_email: UK_MAILBOX, to_email: to,
          subject: log.subject, body_text: body ? body.slice(0, BODY_MAX) : null,
          sent_at: log.created_at,
        })
      } else {
        // reply → stub seulement si aucun vrai message entrant proche n'est archivé.
        if (!inf.email || hasRealInboundNear(inf.id, log.created_at)) { skipped++; continue }
        inStubs++
        rows.push({
          influencer_id: inf.id, market, mailbox: UK_MAILBOX,
          direction: "in", source: "backfill",
          message_id: `backfill:${log.id}`,
          from_email: inf.email, to_email: UK_MAILBOX,
          subject: log.subject, body_text: null,
          sent_at: log.created_at,
        })
      }
    }

    let inserted = 0
    if (rows.length) {
      const { error, count } = await supabase
        .from("influence_messages")
        .upsert(rows, { onConflict: "mailbox,message_id", ignoreDuplicates: true, count: "exact" })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      inserted = count ?? rows.length
    }
    return NextResponse.json({ ok: true, scanned: (logs || []).length, inserted, outRendered, outStubs, inStubs, skipped })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
