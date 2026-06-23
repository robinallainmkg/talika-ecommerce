import nodemailer from "nodemailer"

// Envoi d'email transactionnel via SMTP (ex. Microsoft 365 : smtp.office365.com:587).
// Les identifiants viennent des variables d'env Vercel (jamais dans le code) :
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optionnel)
// Si elles ne sont pas configurées, on n'envoie rien (le lien d'activation reste
// le mécanisme de secours, toujours renvoyé par /api/users).

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

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

export async function sendInviteEmail(to: string, link: string): Promise<boolean> {
  if (!smtpConfigured()) return false
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!
  await getTransporter().sendMail({
    from: `"Talika" <${from}>`,
    to,
    subject: "Votre accès au dashboard Talika",
    text: `Bonjour,

Vous avez été invité au dashboard Talika. Activez votre compte et choisissez votre mot de passe via ce lien (valable 24 h) :

${link}

À bientôt,
L'équipe Talika`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#18181b;line-height:1.5">
      <p>Bonjour,</p>
      <p>Vous avez été invité au <strong>dashboard Talika</strong>. Cliquez ci-dessous pour activer votre compte et choisir votre mot de passe (lien valable 24 h) :</p>
      <p><a href="${link}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Activer mon compte</a></p>
      <p style="color:#71717a;font-size:13px">Ou copiez ce lien : <br>${link}</p>
      <p style="color:#71717a;font-size:13px">À bientôt,<br>L'équipe Talika</p>
    </div>`,
  })
  return true
}
