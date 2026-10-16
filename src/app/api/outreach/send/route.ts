/**
 * POST /api/outreach/send — porte d'envoi HTTPS de la boîte créatrices
 * (talika@companion-ecommerce.com) pour un agent cloud (Pilotage), sans IMAP ni SMTP côté client.
 * Protégé EXACTEMENT comme le cron : `Authorization: Bearer <CRON_SECRET>`.
 *
 * Corps JSON :
 *   { to: string | string[] (≤ 3), subject, text, html?, in_reply_to?, references?: string | string[],
 *     market: 'UK' | 'US' | 'FR', influencer_id?, attachments?: [{ filename, content_base64, content_type? }],
 *     dry_run?: boolean }
 *
 * Chemin d'envoi = celui du drip et de la réponse in-app (src/lib/mailer sendMail : Resend HTTP si
 * RESEND_API_KEY, sinon SMTP_*), expéditeur OUTREACH_FROM, Reply-To OUTREACH_REPLY_TO (mêmes défauts
 * que /api/influencers/conversations/reply). Message-ID généré ici ; In-Reply-To/References posés.
 *
 * Journal : influence_messages (direction 'out'). ⚠️ La contrainte CHECK `source` de la table
 * n'accepte pas 'api' (drip|compose|reply_ui|imap|graph|manual|backfill) → on journalise en
 * source 'compose' (message au corps libre), et `influencer_id` est NOT NULL → sans fiche
 * influenceuse trouvée (id fourni ou email connu), l'envoi part mais n'est pas journalisé
 * (warning dans la réponse). N'écrit JAMAIS dans outreach_log (anti-doublon du drip, fail-closed).
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { sendMail, smtpConfigured, type MailAttachment } from "@/lib/mailer"
import { logOutbound, UK_MAILBOX, BODY_MAX } from "@/lib/influence/messages"
import { MARKETS, type Market } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Mêmes défauts que conversations/reply et lib/influence/outreach (domaine vérifié).
const OUTREACH_FROM_DEFAULT = "Talika <talika@companion-ecommerce.com>"
const OUTREACH_REPLY_DEFAULT = "talika@companion-ecommerce.com"
const MAX_BODY_BYTES = 4 * 1024 * 1024   // 4 Mo (Vercel coupe de toute façon à ~4,5 Mo)
const MAX_RECIPIENTS = 3
const MAX_ATTACHMENTS = 10
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status })

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`
}

// '<id@host>' : on normalise avec chevrons (influence_messages.message_id les garde tels que
// reçus par IMAP, l'appelant peut passer avec ou sans).
const angle = (id: string) => { const t = id.trim(); return t.startsWith("<") ? t : `<${t.replace(/^<|>$/g, "")}>` }

function fromDomain(from: string): string {
  const m = from.match(/@([A-Za-z0-9.-]+)>?\s*$/)
  return (m?.[1] || "companion-ecommerce.com").toLowerCase()
}

function listOf(v: unknown): string[] {
  if (typeof v === "string") return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean)
  return []
}

export async function POST(request: Request) {
  if (!authorized(request)) return bad("Unauthorized", 401)
  try {
    // Taille brute AVANT parsing (413 propre plutôt qu'un crash mémoire).
    const raw = await request.text()
    const rawBytes = Buffer.byteLength(raw, "utf8")
    if (rawBytes > MAX_BODY_BYTES) return bad(`corps trop volumineux (${rawBytes} octets > ${MAX_BODY_BYTES})`, 413)
    let b: Record<string, unknown>
    try { b = JSON.parse(raw || "{}") } catch { return bad("JSON invalide") }
    if (!b || typeof b !== "object" || Array.isArray(b)) return bad("corps JSON attendu")

    // ── Destinataires ──
    const to = listOf(b.to)
    if (!to.length) return bad("`to` requis (string ou tableau)")
    if (to.length > MAX_RECIPIENTS) return bad(`au plus ${MAX_RECIPIENTS} destinataires (${to.length} reçus)`)
    const invalid = to.filter((e) => !EMAIL_RE.test(e))
    if (invalid.length) return bad(`destinataire invalide : ${invalid.join(", ")}`)
    const toLower = to.map((e) => e.toLowerCase())

    // ── Sujet / corps ──
    const subject = typeof b.subject === "string" ? b.subject.trim() : ""
    if (!subject) return bad("`subject` requis")
    if (subject.length > 500) return bad("`subject` trop long (> 500)")
    const text = typeof b.text === "string" ? b.text : ""
    if (!text.trim()) return bad("`text` requis (corps texte brut)")
    const html = typeof b.html === "string" && b.html.trim() ? b.html : undefined

    // ── Marché ──
    const marketRaw = typeof b.market === "string" ? b.market.toUpperCase() : ""
    if (!(MARKETS as readonly string[]).includes(marketRaw)) return bad(`\`market\` requis : ${MARKETS.join(" | ")}`)
    const market = marketRaw as Market

    // ── Influenceuse (optionnel) ──
    const influencerId = typeof b.influencer_id === "string" && b.influencer_id.trim() ? b.influencer_id.trim() : null
    if (influencerId && !UUID_RE.test(influencerId)) return bad("`influencer_id` doit être un uuid")

    // ── Threading ──
    const inReplyTo = typeof b.in_reply_to === "string" && b.in_reply_to.trim() ? angle(b.in_reply_to) : null
    const refs = listOf(b.references).map(angle)
    if (inReplyTo && !refs.includes(inReplyTo)) refs.push(inReplyTo)

    // ── Pièces jointes ──
    const attachments: MailAttachment[] = []
    if (b.attachments !== undefined) {
      if (!Array.isArray(b.attachments)) return bad("`attachments` doit être un tableau")
      if (b.attachments.length > MAX_ATTACHMENTS) return bad(`au plus ${MAX_ATTACHMENTS} pièces jointes`)
      for (const [i, a] of (b.attachments as unknown[]).entries()) {
        const att = (a && typeof a === "object" ? a : {}) as Record<string, unknown>
        const filename = typeof att.filename === "string" ? att.filename.trim().replace(/[\\/]/g, "_") : ""
        const content = typeof att.content_base64 === "string" ? att.content_base64.replace(/\s+/g, "") : ""
        if (!filename) return bad(`attachments[${i}].filename requis`)
        if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return bad(`attachments[${i}].content_base64 invalide`)
        const contentType = typeof att.content_type === "string" && att.content_type.trim() ? att.content_type.trim() : undefined
        attachments.push({ filename, content: Buffer.from(content, "base64"), contentType })
      }
    }

    const dryRun = b.dry_run === true
    const from = process.env.OUTREACH_FROM || OUTREACH_FROM_DEFAULT
    const replyTo = process.env.OUTREACH_REPLY_TO || OUTREACH_REPLY_DEFAULT
    const messageId = `<${randomUUID()}@${fromDomain(from)}>`
    const headers: Record<string, string> = {}
    if (inReplyTo) headers["In-Reply-To"] = inReplyTo
    if (refs.length) headers["References"] = refs.join(" ")
    const sizeBytes = Buffer.byteLength(text, "utf8") + (html ? Buffer.byteLength(html, "utf8") : 0)
      + attachments.reduce((n, a) => n + a.content.length, 0)
    // Même arbitrage que sendMail : Resend HTTP dès que RESEND_API_KEY existe (on passe toujours
    // un `from`), sinon SMTP_* (Hostinger), sinon rien.
    const channel = process.env.RESEND_API_KEY ? "resend" : smtpConfigured() ? "smtp" : "none"

    if (dryRun) {
      return NextResponse.json({
        ok: true, dry_run: true,
        rendered: {
          from, reply_to: replyTo, to, subject, market,
          headers: { "Message-ID": messageId, ...headers },
          size_bytes: sizeBytes, has_html: !!html,
          attachments: attachments.map((a) => ({ filename: a.filename, size: a.content.length, content_type: a.contentType || null })),
          channel,
        },
      })
    }

    if (channel === "none") return bad("Aucun canal mail configuré (RESEND_API_KEY ou SMTP_*)", 500)

    // ── Envoi réel (même chemin que drip / reply / compose) ──
    const r = await sendMail({
      to, subject, text, ...(html ? { html } : {}), from, replyTo, messageId,
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(attachments.length ? { attachments } : {}),
    })
    if (!r.ok) return bad(`envoi échoué : ${r.error || "erreur inconnue"}`, 500)

    // ── Journal influence_messages (best-effort : l'email est PARTI) ──
    // Résolution de la fiche : influencer_id fourni (1er destinataire), sinon email connu
    // (même marché d'abord, puis tous marchés).
    const byEmail = new Map<string, { id: string; market: string | null }>()
    const { data: infs } = await supabase
      .from("influencers").select("id,email,market")
      .in("email", [...toLower, ...to]).limit(50)
    for (const inf of (infs || []) as { id: string; email: string | null; market: string | null }[]) {
      const e = (inf.email || "").trim().toLowerCase()
      if (!e) continue
      const prev = byEmail.get(e)
      if (!prev || (inf.market || "").toUpperCase() === market) byEmail.set(e, { id: inf.id, market: inf.market })
    }
    if (influencerId) {
      const { data: given } = await supabase.from("influencers").select("id").eq("id", influencerId).maybeSingle()
      if (given) byEmail.set(toLower[0], { id: given.id, market })
    }
    const sentAt = new Date().toISOString()
    const journaled: { to_email: string; influencer_id: string | null; ok: boolean; error?: string }[] = []
    for (const [i, email] of toLower.entries()) {
      const inf = byEmail.get(email)
      if (!inf) { journaled.push({ to_email: email, influencer_id: null, ok: false, error: "aucune fiche influenceuse pour cet email (influencer_id NOT NULL)" }); continue }
      const res = await logOutbound(supabase, {
        influencer_id: inf.id, market, mailbox: UK_MAILBOX, source: "compose",
        to_email: email, subject, body_text: text.slice(0, BODY_MAX),
        provider_id: r.id || null, in_reply_to: inReplyTo, references_ids: refs.length ? refs : null,
        sent_at: sentAt,
        // (mailbox, message_id) est unique : un même email à 2 fiches → suffixe par destinataire.
        message_id: i === 0 ? messageId : `${messageId}:to=${email}`,
      })
      journaled.push({ to_email: email, influencer_id: inf.id, ok: res.ok, ...(res.ok ? {} : { error: res.error }) })
    }
    const notLogged = journaled.filter((j) => !j.ok)
    return NextResponse.json({
      ok: true, dry_run: false, message_id: messageId, provider_id: r.id || null, channel,
      to, subject, market, sent_at: sentAt, journaled,
      ...(notLogged.length ? { warning: `envoyé mais ${notLogged.length} destinataire(s) non journalisé(s) dans influence_messages` } : {}),
    })
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Failed", 500)
  }
}
