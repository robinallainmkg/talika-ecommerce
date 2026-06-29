/**
 * GET /api/cron/outreach — routine quotidienne d'outreach influence UK.
 * Protégé par CRON_SECRET (en-tête Authorization: Bearer <CRON_SECRET>).
 *
 * Chaque run, en autonomie :
 *   1. Réponses : lit la boîte IMAP, matche l'expéditeur avec les contacts UK,
 *      classe (Intéressée / Pas intéressée / Désinscrit / Répondu) → met à jour la pipeline + stoppe le drip.
 *   2. Opens : agrège les ouvertures des dernières 24 h (pixel).
 *   3. Batch warm-up : envoie l'étape due à DAILY_CAP contacts (jours ouvrés).
 *      ⚠️ DRY tant que OUTREACH_ENABLED !== "1" (calcule + récap, mais n'envoie rien).
 *   4. Récap : email à OUTREACH_DIGEST_TO (qui a ouvert / répondu / été contacté).
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"
import { fetchRecentMessages, imapConfigured } from "@/lib/influence/imap"
import { sendDueBatch } from "@/lib/influence/outreach-run"
import {
  classifyReply, appBaseUrl, defaultState, warmupCap, type OutreachState,
} from "@/lib/influence/outreach"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const MARKET = "UK"
const REPLY_DONE = ["Répondu", "Intéressée", "Pas intéressée", "Désinscrit", "Bounce", "Exclu"]

interface Contact { id: string; name: string; email: string | null; metadata: Record<string, unknown> | null }
const stateOf = (c: Contact): OutreachState => ((c.metadata?.outreach as OutreachState) || defaultState())

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const now = new Date()
  const { data: contacts = [] } = await supabase
    .from("influencers").select("id,name,email,metadata").eq("market", MARKET)
  const list = (contacts || []) as Contact[]
  const byEmail = new Map<string, Contact>()
  for (const c of list) if (c.email) byEmail.set(c.email.trim().toLowerCase(), c)

  // 1. RÉPONSES + BOUNCES (IMAP) → pipeline
  const newReplies: { name: string; email: string | null; subject: string; status: string }[] = []
  const bounced: string[] = []
  let replyError: string | undefined
  if (imapConfigured()) {
    try {
      const scan = await fetchRecentMessages(60)
      for (const m of scan.messages) {
        const c = byEmail.get(m.from_email)
        if (!c) continue
        const st = stateOf(c)
        if (REPLY_DONE.includes(st.status)) continue
        const cls = classifyReply(m.subject)
        st.status = cls; st.replied_at = now.toISOString(); st.reply_summary = m.subject.slice(0, 160)
        await supabase.from("influencers").update({ metadata: { ...(c.metadata || {}), outreach: st }, updated_at: now.toISOString() }).eq("id", c.id)
        await supabase.from("outreach_log").insert({ influencer_id: c.id, market: MARKET, step: st.step || 0, channel: "reply", status: cls, subject: m.subject.slice(0, 200) })
        newReplies.push({ name: c.name, email: c.email, subject: m.subject, status: cls })
      }
      // Bounces : adresse en échec → statut "Bounce" (terminal, stoppe le drip → protège la réputation)
      for (const email of scan.bounceRecipients) {
        const c = byEmail.get(email)
        if (!c) continue
        const st = stateOf(c)
        if (st.status === "Bounce") continue
        st.status = "Bounce"
        await supabase.from("influencers").update({ metadata: { ...(c.metadata || {}), outreach: st }, updated_at: now.toISOString() }).eq("id", c.id)
        await supabase.from("outreach_log").insert({ influencer_id: c.id, market: MARKET, step: st.step || 0, channel: "bounce", status: "bounce", to_email: email })
        bounced.push(c.name)
      }
    } catch (e) { replyError = e instanceof Error ? e.message : String(e) }
  }

  // 2. OPENS (dernières 24 h)
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data: opensLog } = await supabase
    .from("outreach_log").select("influencer_id").eq("channel", "open").gte("created_at", since)
  const openIds = new Set((opensLog || []).map((o: { influencer_id: string }) => o.influencer_id))
  const opens = list.filter((c) => openIds.has(c.id)).map((c) => c.name)

  // 3. BATCH warm-up (jours ouvrés ; DRY sauf OUTREACH_ENABLED=1 ; plafond qui MONTE)
  const enabled = process.env.OUTREACH_ENABLED === "1"
  const day = now.getUTCDay()
  const isWeekday = day >= 1 && day <= 5
  // Plafond du jour = rampe warm-up selon les jours depuis le 1er envoi réel.
  const { data: firstSent } = await supabase
    .from("outreach_log").select("created_at")
    .eq("channel", "email").eq("status", "sent")
    .order("created_at", { ascending: true }).limit(1)
  const startIso = (firstSent && firstSent[0]?.created_at) || null
  const warmupDay = startIso ? Math.floor((now.getTime() - new Date(startIso).getTime()) / 86400000) : 0
  const cap = Number(process.env.OUTREACH_DAILY_CAP) || warmupCap(warmupDay)
  let batch = { attempted: 0, sent: 0, results: [] as { name: string; result: string; step?: number }[] }
  if (isWeekday) {
    batch = await sendDueBatch(supabase, { market: MARKET, dry: !enabled, max: cap, baseUrl: appBaseUrl() })
  }
  const contactedToday = batch.results.filter((r) => r.result === "sent" || r.result === "dry")

  // Pipeline (compteurs)
  const counts: Record<string, number> = {}
  for (const c of list) { const s = stateOf(c).status; counts[s] = (counts[s] || 0) + 1 }

  // 4. RÉCAP email (seulement s'il se passe quelque chose)
  const activity = newReplies.length || opens.length || contactedToday.length || bounced.length
  let digestSent = false
  if (activity) {
    const li = (a: string[]) => a.length ? a.map((x) => `<li>${x}</li>`).join("") : "<li>—</li>"
    const repl = newReplies.map((r) => `${r.name} — <b>${r.status}</b> · « ${r.subject} »`)
    const cont = contactedToday.map((r) => `${r.name} (étape ${r.step})`)
    const mode = enabled ? "RÉEL" : "DRY (aucun envoi)"
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1b1b1b">
      <h2 style="color:#0F5563">Talika UK · outreach — récap</h2>
      <p>Mode d'envoi : <b>${mode}</b> · 🔥 warm-up jour ${warmupDay}, plafond <b>${cap}/jour</b></p>
      <h3>📨 Réponses (${newReplies.length})</h3><ul>${li(repl)}</ul>
      <h3>👀 Ouvertures 24 h (${opens.length})</h3><ul>${li(opens)}</ul>
      <h3>✉️ Contactées aujourd'hui (${contactedToday.length})</h3><ul>${li(cont)}</ul>
      ${bounced.length ? `<h3 style="color:#C0392B">↩️ Bounces — drip stoppé (${bounced.length})</h3><ul>${li(bounced)}</ul>` : ""}
      <h3>📊 Pipeline</h3><ul>${Object.entries(counts).map(([k, v]) => `<li>${k} : ${v}</li>`).join("")}</ul>
      ${replyError ? `<p style="color:#C0392B">⚠️ IMAP : ${replyError}</p>` : ""}
      <p style="color:#888;font-size:12px">Les profils "Intéressée" sont à traiter en priorité. Réponds-leur depuis talika@companion-ecommerce.com.</p>
      </div>`
    const text = `Talika UK outreach — Mode ${mode} · warm-up jour ${warmupDay}, plafond ${cap}/j\nRéponses: ${repl.join(" | ") || "—"}\nOuvertures: ${opens.join(", ") || "—"}\nContactées: ${cont.join(", ") || "—"}\nBounces: ${bounced.join(", ") || "—"}`
    const r = await sendMail({
      to: process.env.OUTREACH_DIGEST_TO || "robinallainmkg@gmail.com",
      subject: `Talika UK outreach — ${newReplies.length} réponse(s), ${contactedToday.length} contactée(s)`,
      html, text, from: process.env.OUTREACH_FROM || undefined,
    })
    digestSent = r.ok
  }

  return NextResponse.json({
    enabled, weekday: isWeekday, warmupDay, cap,
    replies: newReplies, bounced, opens, contacted: contactedToday, counts,
    batch: { sent: batch.sent, attempted: batch.attempted, dry: !enabled },
    digestSent, replyError,
  })
}
