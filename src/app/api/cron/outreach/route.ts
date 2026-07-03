/**
 * GET /api/cron/outreach â routine quotidienne d'outreach influence UK.
 * ProtÃ©gÃ© par CRON_SECRET (en-tÃªte Authorization: Bearer <CRON_SECRET>).
 *
 * Chaque run, en autonomie :
 *   1. RÃ©ponses : lit la boÃ®te IMAP, matche l'expÃ©diteur avec les contacts UK,
 *      classe (IntÃ©ressÃ©e / Pas intÃ©ressÃ©e / DÃ©sinscrit / RÃ©pondu) â met Ã  jour la pipeline + stoppe le drip.
 *   2. Opens : agrÃ¨ge les ouvertures des derniÃ¨res 24 h (pixel).
 *   3. Batch warm-up : envoie l'Ã©tape due Ã  DAILY_CAP contacts (jours ouvrÃ©s).
 *      â ï¸ DRY tant que OUTREACH_ENABLED !== "1" (calcule + rÃ©cap, mais n'envoie rien).
 *   4. RÃ©cap : email Ã  OUTREACH_DIGEST_TO (qui a ouvert / rÃ©pondu / Ã©tÃ© contactÃ©).
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
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache → lectures
// périmées (incident 03/07 : triple envoi, compteur à 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const MARKET = "UK"
const REPLY_DONE = ["RÃ©pondu", "IntÃ©ressÃ©e", "Pas intÃ©ressÃ©e", "DÃ©sinscrit", "Bounce", "Exclu"]

interface Contact { id: string; name: string; email: string | null; metadata: Record<string, unknown> | null }
const stateOf = (c: Contact): OutreachState => ((c.metadata?.outreach as OutreachState) || defaultState())

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(request.url)
  // ?ping=1 â health check + sonde du compteur journalier (exÃ©cute la requÃªte exacte
  // et renvoie donnÃ©es/erreur brutes â diagnostic du sentToday=0 du 03/07).
  if (url.searchParams.get("ping") === "1") {
    const n = new Date()
    const dayStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).toISOString()
    // RÃ´le rÃ©el de la clÃ© utilisÃ©e (claims du JWT â on n'expose jamais la clÃ©).
    let keyRole = "?"
    try {
      const k = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      keyRole = k.split(".").length === 3
        ? JSON.parse(Buffer.from(k.split(".")[1], "base64").toString()).role || "jwt-sans-role"
        : `format:${k.slice(0, 10)}â¦`
    } catch { keyRole = "jwt-illisible" }
    const all = await supabase.from("outreach_log").select("id,channel,status,created_at").limit(5)
    const filtered = await supabase.from("outreach_log").select("id")
      .eq("channel", "email").eq("status", "sent").gte("created_at", dayStart)
    const inf = await supabase.from("influencers").select("id").eq("market", "UK").limit(3)
    return NextResponse.json({
      ok: true, version: "debug-counter-v2", dayStart, keyRole,
      logAll: { count: all.data?.length ?? null, sample: all.data?.[0] || null, error: all.error?.message || null },
      logFiltered: { count: filtered.data?.length ?? null, error: filtered.error?.message || null },
      influencers: { count: inf.data?.length ?? null, error: inf.error?.message || null },
      supabaseHost: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0],
    })
  }
  // ?send=1 â autorise l'envoi rÃ©el pour CE run (appelant authentifiÃ© par CRON_SECRET =
  // la routine Claude Code). Sinon : OUTREACH_ENABLED=1 (env) ou DRY.
  const sendParam = url.searchParams.get("send") === "1"
  // ?only=<influencer_id> â run ciblÃ© (test sur un seul contact).
  const only = url.searchParams.get("only") || undefined
  const now = new Date()
  const { data: contacts = [] } = await supabase
    .from("influencers").select("id,name,email,metadata").eq("market", MARKET)
  const list = (contacts || []) as Contact[]
  const byEmail = new Map<string, Contact>()
  for (const c of list) if (c.email) byEmail.set(c.email.trim().toLowerCase(), c)

  // 1. RÃPONSES + BOUNCES (IMAP) â pipeline
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
        // Pipeline kanban : rÃ©ponse â En discussion ; refus/dÃ©sinscription â DÃ©clinÃ©.
        const stageTarget = cls === "Pas intÃ©ressÃ©e" || cls === "DÃ©sinscrit" ? "decline" : "discussion"
        await supabase.from("influence_campaign_collabs")
          .update({ stage: stageTarget }).eq("influencer_id", c.id).in("stage", ["prospect", "contacte"])
        newReplies.push({ name: c.name, email: c.email, subject: m.subject, status: cls })
      }
      // Bounces : adresse en Ã©chec â statut "Bounce" (terminal, stoppe le drip â protÃ¨ge la rÃ©putation)
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

  // 2. OPENS (derniÃ¨res 24 h)
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data: opensLog } = await supabase
    .from("outreach_log").select("influencer_id").eq("channel", "open").gte("created_at", since)
  const openIds = new Set((opensLog || []).map((o: { influencer_id: string }) => o.influencer_id))
  const opens = list.filter((c) => openIds.has(c.id)).map((c) => c.name)

  // 3. BATCH warm-up (jours ouvrÃ©s ; envoi rÃ©el si OUTREACH_ENABLED=1 OU ?send=1 ; plafond qui MONTE)
  const enabled = process.env.OUTREACH_ENABLED === "1" || sendParam
  const day = now.getUTCDay()
  const isWeekday = day >= 1 && day <= 5
  // Plafond du jour = rampe warm-up selon les jours depuis le 1er envoi rÃ©el.
  const { data: firstSent } = await supabase
    .from("outreach_log").select("created_at")
    .eq("channel", "email").eq("status", "sent")
    .order("created_at", { ascending: true }).limit(1)
  const startIso = (firstSent && firstSent[0]?.created_at) || null
  const warmupDay = startIso ? Math.floor((now.getTime() - new Date(startIso).getTime()) / 86400000) : 0
  const cap = Number(process.env.OUTREACH_DAILY_CAP) || warmupCap(warmupDay)
  // Plafond RÃELLEMENT journalier : on dÃ©compte ce qui est dÃ©jÃ  parti aujourd'hui (UTC),
  // pour que plusieurs runs le mÃªme jour ne dÃ©passent jamais la rampe de warm-up.
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  // FAIL-CLOSED : si le compteur est illisible (ex. DB saturÃ©e), on n'envoie RIEN â
  // c'est un cap rÃ©el, pas indicatif (incident 03/07 : erreurs silencieuses â 3 batchs le mÃªme jour).
  const { data: sentRows, error: capErr } = await supabase
    .from("outreach_log").select("id")
    .eq("channel", "email").eq("status", "sent").gte("created_at", dayStart)
  if (capErr) {
    return NextResponse.json(
      { error: `compteur journalier illisible (${capErr.message}) â envoi annulÃ© (fail-closed)`, enabled, warmupDay, cap },
      { status: 503 }
    )
  }
  const sentToday = (sentRows || []).length
  const remaining = Math.max(0, cap - sentToday)
  let batch = { attempted: 0, sent: 0, results: [] as { name: string; result: string; step?: number }[] }
  if (isWeekday && remaining > 0) {
    batch = await sendDueBatch(supabase, {
      market: MARKET, dry: !enabled, max: remaining,
      ids: only ? [only] : undefined, baseUrl: appBaseUrl(),
    })
  }
  const contactedToday = batch.results.filter((r) => r.result === "sent" || r.result === "dry")

  // Pipeline (compteurs)
  const counts: Record<string, number> = {}
  for (const c of list) { const s = stateOf(c).status; counts[s] = (counts[s] || 0) + 1 }

  // 4. RÃCAP email (seulement s'il se passe quelque chose)
  const activity = newReplies.length || opens.length || contactedToday.length || bounced.length
  let digestSent = false
  if (activity) {
    const li = (a: string[]) => a.length ? a.map((x) => `<li>${x}</li>`).join("") : "<li>â</li>"
    const repl = newReplies.map((r) => `${r.name} â <b>${r.status}</b> Â· Â« ${r.subject} Â»`)
    const cont = contactedToday.map((r) => `${r.name} (Ã©tape ${r.step})`)
    const mode = enabled ? "RÃEL" : "DRY (aucun envoi)"
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1b1b1b">
      <h2 style="color:#0F5563">Talika UK Â· outreach â rÃ©cap</h2>
      <p>Mode d'envoi : <b>${mode}</b> Â· ð¥ warm-up jour ${warmupDay}, plafond <b>${cap}/jour</b></p>
      <h3>ð¨ RÃ©ponses (${newReplies.length})</h3><ul>${li(repl)}</ul>
      <h3>ð Ouvertures 24 h (${opens.length})</h3><ul>${li(opens)}</ul>
      <h3>âï¸ ContactÃ©es aujourd'hui (${contactedToday.length})</h3><ul>${li(cont)}</ul>
      ${bounced.length ? `<h3 style="color:#C0392B">â©ï¸ Bounces â drip stoppÃ© (${bounced.length})</h3><ul>${li(bounced)}</ul>` : ""}
      <h3>ð Pipeline</h3><ul>${Object.entries(counts).map(([k, v]) => `<li>${k} : ${v}</li>`).join("")}</ul>
      ${replyError ? `<p style="color:#C0392B">â ï¸ IMAP : ${replyError}</p>` : ""}
      <p style="color:#888;font-size:12px">Les profils "IntÃ©ressÃ©e" sont Ã  traiter en prioritÃ©. RÃ©ponds-leur depuis talika@companion-ecommerce.com.</p>
      </div>`
    const text = `Talika UK outreach â Mode ${mode} Â· warm-up jour ${warmupDay}, plafond ${cap}/j\nRÃ©ponses: ${repl.join(" | ") || "â"}\nOuvertures: ${opens.join(", ") || "â"}\nContactÃ©es: ${cont.join(", ") || "â"}\nBounces: ${bounced.join(", ") || "â"}`
    const r = await sendMail({
      to: process.env.OUTREACH_DIGEST_TO || "robinallainmkg@gmail.com",
      subject: `Talika UK outreach â ${newReplies.length} rÃ©ponse(s), ${contactedToday.length} contactÃ©e(s)`,
      html, text, from: process.env.OUTREACH_FROM || undefined,
    })
    digestSent = r.ok
  }

  return NextResponse.json({
    enabled, weekday: isWeekday, warmupDay, cap, sentToday, remaining,
    replies: newReplies, bounced, opens, contacted: contactedToday, counts,
    batch: { sent: batch.sent, attempted: batch.attempted, dry: !enabled },
    digestSent, replyError,
  })
}
