// Lecture IMAP de la boîte outreach (talika@companion-ecommerce.com) côté serveur,
// pour la détection des réponses ET des bounces par le cron. Lecture seule.
// Depuis juil. 2026 : télécharge aussi le CORPS des messages des expéditeurs connus
// (prédicat wantBodiesFor) pour alimenter le fil de conversation (influence_messages).
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"

export interface MailHeader {
  from_email: string; from_name: string; subject: string; date: string | null
  message_id: string | null            // Message-ID RFC 5322 (dédup influence_messages)
  in_reply_to: string | null
  to_email: string | null
  body_text?: string | null            // rempli seulement si wantBodiesFor(header) === true
}
export interface ImapScan { messages: MailHeader[]; bounceRecipients: string[] }

const BOUNCE_RE = /mailer-daemon|postmaster|mail delivery (failed|subsystem)|delivery status|undeliver|failure notice|returned mail|delivery has failed/i
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const BODY_MAX = 20_000

export function imapConfigured(): boolean {
  return !!(process.env.OUTREACH_IMAP_HOST && process.env.OUTREACH_IMAP_USER && process.env.OUTREACH_IMAP_PASSWORD)
}

export async function fetchRecentMessages(
  limit = 60,
  opts?: { wantBodiesFor?: (h: MailHeader) => boolean }
): Promise<ImapScan> {
  if (!imapConfigured()) return { messages: [], bounceRecipients: [] }
  const client = new ImapFlow({
    host: process.env.OUTREACH_IMAP_HOST!,
    port: Number(process.env.OUTREACH_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.OUTREACH_IMAP_USER!, pass: process.env.OUTREACH_IMAP_PASSWORD! },
    logger: false,
  })
  const messages: MailHeader[] = []
  const seqByIndex: number[] = []      // seq IMAP de chaque entrée de `messages`
  const bounceSeqs: number[] = []
  await client.connect()
  const lock = await client.getMailboxLock("INBOX")
  try {
    const total = (client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0) || 0
    if (total > 0) {
      const start = Math.max(1, total - limit + 1)
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, internalDate: true })) {
        const f = msg.envelope?.from?.[0]
        const subject = msg.envelope?.subject || ""
        const fromEmail = (f?.address || "").toLowerCase()
        messages.push({
          from_email: fromEmail, from_name: f?.name || "", subject,
          date: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
          message_id: msg.envelope?.messageId || null,
          in_reply_to: msg.envelope?.inReplyTo || null,
          to_email: (msg.envelope?.to?.[0]?.address || "").toLowerCase() || null,
        })
        seqByIndex.push(msg.seq || 0)
        if (BOUNCE_RE.test(`${fromEmail} ${subject}`) && msg.seq) bounceSeqs.push(msg.seq)
      }
    }
    // 2e passe (fil de conversation) : corps des seuls messages retenus par le prédicat
    // (expéditeurs connus) — volume maîtrisé, on ne télécharge jamais toute la boîte.
    if (opts?.wantBodiesFor) {
      const wanted = new Map<number, MailHeader>()   // seq → header à remplir
      messages.forEach((h, i) => {
        if (seqByIndex[i] && opts.wantBodiesFor!(h)) wanted.set(seqByIndex[i], h)
      })
      if (wanted.size) {
        for await (const msg of client.fetch([...wanted.keys()].join(","), { source: true })) {
          const h = msg.seq ? wanted.get(msg.seq) : undefined
          if (!h || !msg.source) continue
          try {
            const parsed = await simpleParser(msg.source)
            // text = corps texte ; à défaut on dégrade le HTML en texte brut grossier.
            const text = parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "")
            h.body_text = text ? text.slice(0, BODY_MAX) : null
          } catch { h.body_text = null }
        }
      }
    }
    // 3e passe : on télécharge le corps des seuls messages de type bounce pour
    // extraire l'adresse destinataire en échec (puis la pipeline la marque "Bounce").
    const bounceRecipients = new Set<string>()
    if (bounceSeqs.length) {
      for await (const msg of client.fetch(bounceSeqs.join(","), { source: true })) {
        const src = msg.source ? msg.source.toString("utf-8") : ""
        for (const m of src.matchAll(EMAIL_RE)) {
          const e = m[0].toLowerCase()
          if (!e.includes("companion-ecommerce.com") && !e.includes("mailer-daemon") && !e.includes("postmaster")) {
            bounceRecipients.add(e)
          }
        }
      }
    }
    return { messages, bounceRecipients: [...bounceRecipients] }
  } finally {
    lock.release()
    await client.logout().catch(() => {})
  }
}
