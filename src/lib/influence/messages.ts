// Fil de conversation influence (table influence_messages) — corps complets,
// entrant + sortant, multi-boîtes. ⚠️ Ce fil est un JOURNAL D'AFFICHAGE :
// l'anti-doublon du drip reste porté par outreach_log (fail-closed, incident 03/07).
// Ici tout est best-effort : une écriture qui échoue ne doit JAMAIS bloquer un envoi.
import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export type MessageDirection = "in" | "out"
export type MessageSource = "drip" | "compose" | "reply_ui" | "imap" | "graph" | "manual" | "backfill"

export interface InfluenceMessage {
  id: string
  influencer_id: string
  market: string
  mailbox: string
  direction: MessageDirection
  source: MessageSource
  message_id: string
  in_reply_to: string | null
  references_ids: string[] | null
  provider_id: string | null
  from_email: string
  to_email: string
  subject: string | null
  body_text: string | null
  sent_at: string
  created_at: string
}

// Boîte outreach UK (alignée sur OUTREACH_FROM/OUTREACH_REPLY_TO par défaut).
export const UK_MAILBOX = process.env.OUTREACH_IMAP_USER || "talika@companion-ecommerce.com"

// Corps tronqués (sécurité taille de ligne / colonnes jsonb voisines).
export const BODY_MAX = 20_000

// Message-ID synthétique quand le vrai manque (sortant Resend, vieux logs).
export function synthMessageId(...parts: (string | null | undefined)[]): string {
  return "synth:" + createHash("sha1").update(parts.map((p) => p || "").join("|")).digest("hex")
}

export interface OutboundMsg {
  influencer_id: string
  market: string
  mailbox?: string
  source: Extract<MessageSource, "drip" | "compose" | "reply_ui" | "backfill">
  to_email: string
  subject: string
  body_text: string
  provider_id?: string | null
  in_reply_to?: string | null
  references_ids?: string[] | null
  sent_at?: string
  message_id?: string
}

// Insert best-effort d'un message SORTANT. Ne lève jamais : retourne { ok, error }.
export async function logOutbound(
  supabase: SupabaseClient,
  m: OutboundMsg
): Promise<{ ok: boolean; error?: string }> {
  try {
    const mailbox = m.mailbox || UK_MAILBOX
    const message_id =
      m.message_id || (m.provider_id ? `out:${m.provider_id}` : synthMessageId(mailbox, m.to_email, m.subject, m.sent_at || new Date().toISOString()))
    const { error } = await supabase.from("influence_messages").insert({
      influencer_id: m.influencer_id,
      market: m.market,
      mailbox,
      direction: "out",
      source: m.source,
      message_id,
      in_reply_to: m.in_reply_to || null,
      references_ids: m.references_ids || null,
      provider_id: m.provider_id || null,
      from_email: mailbox,
      to_email: m.to_email,
      subject: m.subject,
      body_text: (m.body_text || "").slice(0, BODY_MAX),
      sent_at: m.sent_at || new Date().toISOString(),
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface InboundMsg {
  influencer_id: string
  market: string
  mailbox: string
  source: Extract<MessageSource, "imap" | "graph" | "manual" | "backfill">
  from_email: string
  to_email?: string
  subject: string | null
  body_text: string | null
  message_id?: string | null   // Message-ID réel si dispo, sinon synthétisé
  in_reply_to?: string | null
  sent_at: string
}

// Upsert idempotent d'un lot de messages ENTRANTS (dédup par (mailbox, message_id)).
export async function logInboundBatch(
  supabase: SupabaseClient,
  rows: InboundMsg[]
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  if (!rows.length) return { ok: true, inserted: 0 }
  try {
    const payload = rows.map((m) => ({
      influencer_id: m.influencer_id,
      market: m.market,
      mailbox: m.mailbox,
      direction: "in" as const,
      source: m.source,
      message_id: m.message_id || synthMessageId(m.mailbox, m.from_email, m.subject, m.sent_at),
      in_reply_to: m.in_reply_to || null,
      from_email: m.from_email,
      to_email: m.to_email || m.mailbox,
      subject: m.subject,
      body_text: m.body_text ? m.body_text.slice(0, BODY_MAX) : null,
      sent_at: m.sent_at,
    }))
    const { error, count } = await supabase
      .from("influence_messages")
      .upsert(payload, { onConflict: "mailbox,message_id", ignoreDuplicates: true, count: "exact" })
    return error ? { ok: false, inserted: 0, error: error.message } : { ok: true, inserted: count ?? payload.length }
  } catch (e) {
    return { ok: false, inserted: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
