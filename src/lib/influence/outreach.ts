// Outreach influence — drip email "entonnoir ouvert" (Talika UK).
// Envoi délégué à src/lib/mailer (Resend HTTP OU SMTP — ex. Resend branché en SMTP).
// L'état du drip vit dans influencers.metadata.outreach ; le journal dans outreach_log.
// DRY par défaut : aucun email ne part sans dry=false ET un canal mail configuré.
import { sendMail, mailerConfigured } from "@/lib/mailer"
import { TEMPLATES, mergeTemplate, htmlWrap } from "./templates"
export { TEMPLATES, mergeTemplate, htmlWrap } from "./templates"
export type { RawTemplate } from "./templates"

export type OutreachStatus =
  | "À contacter" | "À qualifier"
  | "Étape 1 envoyée" | "Étape 2 envoyée" | "Étape 3 envoyée"
  | "Répondu" | "Intéressée" | "Pas intéressée"
  | "Bounce" | "Désinscrit" | "Exclu"

export const TERMINAL: OutreachStatus[] = [
  "À qualifier", "Répondu", "Intéressée", "Pas intéressée", "Bounce", "Désinscrit", "Exclu",
]

export interface OutreachState {
  status: OutreachStatus
  step: number                       // dernière étape envoyée (0 = aucune)
  sent: Record<string, string>       // { "1": iso, "2": iso, "3": iso }
  email_status?: string              // verified | agency | à sourcer
  personalisation?: string
  replied_at?: string
  reply_summary?: string
}

// Cadence (jours depuis l'envoi précédent)
export const DAYS_STEP2 = 4          // J+4 après étape 1
export const DAYS_STEP3 = 5          // J+5 après étape 2 (≈ J+9)
export const DAILY_CAP = 10          // plafond de repli si pas de date de départ

// Warm-up domaine neuf : plafond d'envois/jour qui MONTE progressivement selon le
// nombre de jours depuis le 1er envoi réel. Envoyer trop, trop vite, depuis un domaine
// jeune = spam + réputation grillée. Rampe douce sur ~1 mois.
export function warmupCap(daysSinceStart: number): number {
  if (daysSinceStart <= 4) return 8        // semaine 1
  if (daysSinceStart <= 11) return 15      // semaine 2
  if (daysSinceStart <= 18) return 25      // semaine 3
  if (daysSinceStart <= 25) return 40      // semaine 4
  return 60                                // régime établi
}

export function defaultState(partial?: Partial<OutreachState>): OutreachState {
  return { status: "À contacter", step: 0, sent: {}, ...partial }
}

// Quelle étape est DUE maintenant pour ce contact (ou null) ?
export function dueStep(s: OutreachState | undefined | null, now = new Date()): 1 | 2 | 3 | null {
  if (!s) return 1
  if (TERMINAL.includes(s.status)) return null
  const days = (iso?: string) => (iso ? (now.getTime() - new Date(iso).getTime()) / 86400000 : Infinity)
  if (s.status === "À contacter" && !s.sent["1"]) return 1
  if (s.sent["1"] && !s.sent["2"] && days(s.sent["1"]) >= DAYS_STEP2) return 2
  if (s.sent["2"] && !s.sent["3"] && days(s.sent["2"]) >= DAYS_STEP3) return 3
  return null
}

// ─── Rendu du drip (templates dans ./templates) ───
interface Ctx { first_name: string; personalisation?: string; sender: string }

export function renderStep(step: 1 | 2 | 3, c: Ctx): { subject: string; text: string; html: string } {
  const tpl = TEMPLATES.find((t) => t.key === `step${step}`) || TEMPLATES[0]
  const vars = { first_name: c.first_name, personalisation: c.personalisation || "", sender: c.sender || "Talika UK" }
  const subject = mergeTemplate(tpl.subject, vars)
  const text = mergeTemplate(tpl.body, vars)
  return { subject, text, html: htmlWrap(text) }
}

// ─── Envoi (délégué au mailer : Resend HTTP ou SMTP) ───
// Configuré si un canal mail existe (RESEND_API_KEY ou SMTP_* — donc Resend-en-SMTP OK).
export function outreachConfigured(): boolean {
  return mailerConfigured()
}

// Identité d'envoi outreach. En DUR par défaut (domaine vérifié dans Resend) pour ne PAS
// dépendre d'une variable Vercel : l'email part de talika@ ET les réponses y reviennent
// (boîte Hostinger surveillée en IMAP). Surchargeable via OUTREACH_FROM / OUTREACH_REPLY_TO.
const OUTREACH_FROM_DEFAULT = "Talika <talika@companion-ecommerce.com>"
const OUTREACH_REPLY_DEFAULT = "talika@companion-ecommerce.com"

export async function sendOutreach(to: string, subject: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Outreach 1:1 = TEXTE BRUT (pas de HTML ni pixel) → meilleure délivrabilité (boîte Principale).
  return sendMail({
    to, subject, text,
    from: process.env.OUTREACH_FROM || OUTREACH_FROM_DEFAULT,
    replyTo: process.env.OUTREACH_REPLY_TO || OUTREACH_REPLY_DEFAULT,
  })
}

// ─── Tracking des ouvertures (pixel maison) ───
// URL publique de l'app (pour le pixel + liens). Fallback = prod connue.
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "https://talika-ecommerce.vercel.app"
}

// Pixel 1x1 invisible → /api/influencers/outreach/open journalise l'ouverture.
// ⚠️ Indicatif seulement : Apple Mail Privacy pré-charge les images (gonfle les opens),
// et les images bloquées masquent de vraies ouvertures. La RÉPONSE reste le vrai signal.
export function injectPixel(html: string, influencerId: string, step: number, baseUrl = appBaseUrl()): string {
  const src = `${baseUrl}/api/influencers/outreach/open?i=${encodeURIComponent(influencerId)}&s=${step}`
  return `${html}<img src="${src}" width="1" height="1" alt="" style="display:none;width:1px;height:1px" />`
}

// Classement heuristique d'une réponse (sans LLM) à partir de l'objet/extrait.
export function classifyReply(text: string): OutreachStatus {
  const t = (text || "").toLowerCase()
  if (/unsubscribe|opt[\s-]?out|remove me|stop emailing|do not contact|se désabonner/.test(t)) return "Désinscrit"
  if (/not interested|no thanks|no thank you|not for me|we'll pass|decline|pas intéress/.test(t)) return "Pas intéressée"
  if (/interested|i'?d love|sounds (great|good)|happy to|count me in|keen|let'?s (chat|talk|do)|send (it|me|over)|my address|gifting|collab/.test(t)) return "Intéressée"
  return "Répondu"
}
