import nodemailer from "nodemailer"

// Envoi d'email transactionnel (invitations). Trois chemins, par ordre de priorité :
//   1. Resend (API HTTP) si RESEND_API_KEY est défini — RECOMMANDÉ sur Vercel :
//      en serverless l'API HTTP est plus fiable que le SMTP (pas de handshake
//      lent, renvoie un id de livraison) et n'ajoute aucune dépendance (fetch).
//      L'expéditeur (RESEND_FROM, ex. "Talika <noreply@talika.fr>") doit
//      appartenir à un domaine VÉRIFIÉ dans Resend (SPF/DKIM posés sur talika.fr).
//   2. SMTP (nodemailer) si SMTP_HOST/USER/PASS sont définis (ex. Microsoft 365).
//   3. Sinon : on n'envoie rien → le lien d'activation reste le secours, toujours
//      renvoyé par /api/users (l'admin le copie et le transmet lui-même).

export function resendConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && (process.env.RESEND_FROM || process.env.SMTP_FROM))
}

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

// Vrai si AU MOINS un canal d'envoi est branché (sinon on reste en mode lien manuel).
export function mailerConfigured(): boolean {
  return resendConfigured() || smtpConfigured()
}

const SUBJECT = "Votre accès au dashboard Talika"

function bodyText(link: string): string {
  return `Bonjour,

Vous avez été invité au dashboard Talika. Activez votre compte et choisissez votre mot de passe via ce lien (valable 24 h) :

${link}

À bientôt,
L'équipe Talika`
}

function bodyHtml(link: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#18181b;line-height:1.5">
      <p>Bonjour,</p>
      <p>Vous avez été invité au <strong>dashboard Talika</strong>. Cliquez ci-dessous pour activer votre compte et choisir votre mot de passe (lien valable 24 h) :</p>
      <p><a href="${link}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Activer mon compte</a></p>
      <p style="color:#71717a;font-size:13px">Ou copiez ce lien : <br>${link}</p>
      <p style="color:#71717a;font-size:13px">À bientôt,<br>L'équipe Talika</p>
    </div>`
}

// ── Chemin 1 : Resend (API HTTP, pas de dépendance) ──
async function sendViaResend(to: string, link: string): Promise<boolean> {
  // RESEND_FROM doit être sur un domaine vérifié ; à défaut on réutilise SMTP_FROM.
  const from = process.env.RESEND_FROM || `Talika <${process.env.SMTP_FROM}>`
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject: SUBJECT, text: bodyText(link), html: bodyHtml(link) }),
  })
  if (!res.ok) {
    console.error("Resend send failed:", res.status, await res.text().catch(() => ""))
    return false
  }
  return true
}

// ── Chemin 2 : SMTP (nodemailer) ──
let transporter: nodemailer.Transporter | null = null
function getTransporter() {
  if (transporter) return transporter
  const port = Number(process.env.SMTP_PORT || 587)
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL ; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transporter
}

async function sendViaSmtp(to: string, link: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!
  await getTransporter().sendMail({
    from: `"Talika" <${from}>`,
    to,
    subject: SUBJECT,
    text: bodyText(link),
    html: bodyHtml(link),
  })
  return true
}

// Renvoie true si l'email est parti, false sinon (→ secours = lien manuel).
export async function sendInviteEmail(to: string, link: string): Promise<boolean> {
  if (resendConfigured()) return sendViaResend(to, link)
  if (smtpConfigured()) return sendViaSmtp(to, link)
  return false
}

// ── Envoi générique (sujet/corps libres) — réutilisé par l'outreach influence.
// Même logique de canaux : Resend HTTP si RESEND_API_KEY, sinon SMTP (ex. Resend
// branché en SMTP : SMTP_HOST=smtp.resend.com, SMTP_USER=resend, SMTP_PASS=<clé re_…>).
// headers : en-têtes SMTP additionnels (ex. In-Reply-To/References pour qu'une réponse
// s'affiche dans le bon fil chez le destinataire). Supporté par Resend HTTP ET nodemailer.
export interface MailMsg { to: string; subject: string; text: string; html?: string; from?: string; replyTo?: string; headers?: Record<string, string> }

export async function sendMail(m: MailMsg): Promise<{ ok: boolean; id?: string; error?: string }> {
  // 1. Resend HTTP (si clé API directe)
  if (process.env.RESEND_API_KEY && (m.from || process.env.RESEND_FROM)) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: m.from || process.env.RESEND_FROM, to: m.to, subject: m.subject,
          text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          ...(m.headers ? { headers: m.headers } : {}),
        }),
      })
      if (!res.ok) return { ok: false, error: `Resend HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300) }
      const d = await res.json().catch(() => ({})) as { id?: string }
      return { ok: true, id: d?.id }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
  // 2. SMTP (nodemailer) — y compris Resend-en-SMTP
  if (smtpConfigured()) {
    try {
      const info = await getTransporter().sendMail({
        from: m.from || process.env.SMTP_FROM || process.env.SMTP_USER!,
        to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
      })
      return { ok: true, id: (info as { messageId?: string })?.messageId }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
  return { ok: false, error: "Aucun canal mail configuré (RESEND_API_KEY ou SMTP_*)." }
}
