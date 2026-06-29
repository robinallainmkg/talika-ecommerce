// Templates outreach (données PURES — pas d'import serveur, utilisables côté client).
// Réutilisés par le drip (renderStep), le composer pipeline et le cron.
// Variables fusionnées par destinataire : {first_name} {name} {handle} {personalisation} {sender}

export interface RawTemplate { key: string; label: string; subject: string; body: string }

export const TEMPLATES: RawTemplate[] = [
  {
    key: "step1", label: "Étape 1 — intro (entonnoir ouvert)",
    subject: "Talika x {first_name} — a hello from a French beauty house (since 1948)",
    body: `Hi {first_name},

I'm reaching out from Talika — a French beauty house and a pioneer in eye-contour care and cosmetic innovation since 1948 (75+ years). Today we're especially known for our LED light-therapy beauty devices.

I've really enjoyed your skincare content{personalisation}, and as we grow Talika in the UK we're looking to work with a small circle of skincare creators we genuinely admire.

Would you be open to collaborating with us? And if so, how do you usually like to work — gifting, affiliate, or paid? I'd love to share a few of our hero products and let you pick what you'd most like to try.

No pressure at all — just keen to start a conversation.

Warm wishes,
{sender}

(If you'd rather not hear from me, just reply 'unsubscribe' and I'll take you off my list.)`,
  },
  {
    key: "step2", label: "Étape 2 — relance douce",
    subject: "Re: Talika x {first_name}",
    body: `Hi {first_name},

Just gently floating this back to the top of your inbox 🙂 We'd genuinely love to explore working together — and to send you something to try, whatever format suits you best.

If now isn't the right time, no worries at all.

Warm wishes,
{sender}`,
  },
  {
    key: "step3", label: "Étape 3 — produits",
    subject: "One last hello from Talika 👋",
    body: `Hi {first_name},

Last note from me, promise. A quick snapshot of what we'd love to put in your hands:
• our LED face mask (light-therapy, anti-ageing)
• Time Control 7+ — a 7-in-1 anti-ageing device for the eye & face contour
• and our Hair Force LED cap, if hair's ever your thing

If any of it appeals, just reply and tell me which you'd like to try — I'll arrange it, no strings.

Either way, thank you for the lovely content.
{sender}
Talika UK`,
  },
]

// Variables disponibles pour l'insertion dans le composer.
export const MERGE_VARS = ["first_name", "name", "handle", "sender"] as const

// Fusion {clé} → valeur. Les placeholders inconnus sont laissés tels quels.
export function mergeTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

export function htmlWrap(text: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1b1b1b">${text.replace(/\n/g, "<br>")}</div>`
}
