// Lecture IMAP de la boîte outreach (talika@companion-ecommerce.com) côté serveur,
// pour la détection des réponses par le cron. Lecture seule des en-têtes récents.
import { ImapFlow } from "imapflow"

export interface MailHeader { from_email: string; from_name: string; subject: string; date: string | null }

export function imapConfigured(): boolean {
  return !!(process.env.OUTREACH_IMAP_HOST && process.env.OUTREACH_IMAP_USER && process.env.OUTREACH_IMAP_PASSWORD)
}

export async function fetchRecentMessages(limit = 60): Promise<MailHeader[]> {
  if (!imapConfigured()) return []
  const client = new ImapFlow({
    host: process.env.OUTREACH_IMAP_HOST!,
    port: Number(process.env.OUTREACH_IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.OUTREACH_IMAP_USER!, pass: process.env.OUTREACH_IMAP_PASSWORD! },
    logger: false,
  })
  const out: MailHeader[] = []
  await client.connect()
  const lock = await client.getMailboxLock("INBOX")
  try {
    const total = (client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0) || 0
    if (total > 0) {
      const start = Math.max(1, total - limit + 1)
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, internalDate: true })) {
        const f = msg.envelope?.from?.[0]
        out.push({
          from_email: (f?.address || "").toLowerCase(),
          from_name: f?.name || "",
          subject: msg.envelope?.subject || "",
          date: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
        })
      }
    }
  } finally {
    lock.release()
  }
  await client.logout()
  return out
}
