/**
 * POST /api/cron/invite-resend — renvoie l'email d'invitation d'un compte DÉJÀ invité
 * et jamais activé, pour un agent cloud (Pilotage) qui n'a pas de session admin.
 * Protégé comme le cron : `Authorization: Bearer <CRON_SECRET>`. Corps : { email }.
 *
 * Même mécanisme que POST /api/users (generate_link « invite » + sendInviteEmail), mais
 * volontairement plus étroit :
 *  - ne crée AUCUN compte et ne supprime rien (le compte doit exister, en attente) ;
 *  - garde les métadonnées du compte (rôle, sections) : generate_link sans `data` ;
 *  - refuse un compte déjà actif ou un compte admin ;
 *  - ne renvoie JAMAIS le lien d'activation (il ne part que dans la boîte de la personne).
 * Réponse : { ok, email_sent }.
 */
import { NextResponse } from "next/server"
import { sendInviteEmail } from "@/lib/mailer"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 30

const SITE_URL = "https://talika-ecommerce.vercel.app"

function adminHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !email.includes("@")) return NextResponse.json({ ok: false, error: "email invalide" }, { status: 400 })

  const auth = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
  const list = await fetch(`${auth}/admin/users?per_page=200`, { headers: adminHeaders(), cache: "no-store" })
  if (!list.ok) return NextResponse.json({ ok: false, error: "lecture des comptes impossible" }, { status: 500 })
  const users = ((await list.json()).users || []) as {
    email: string; last_sign_in_at: string | null; user_metadata?: { role?: string }
  }[]
  const user = users.find((u) => (u.email || "").toLowerCase() === email)
  if (!user) return NextResponse.json({ ok: false, error: "aucun compte invité pour cet email" }, { status: 404 })
  if (user.last_sign_in_at) return NextResponse.json({ ok: false, error: "compte déjà actif" }, { status: 409 })
  if (user.user_metadata?.role === "admin") {
    return NextResponse.json({ ok: false, error: "compte admin : invitation depuis /users seulement" }, { status: 403 })
  }

  const gen = await fetch(`${auth}/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ type: "invite", email }),
    cache: "no-store",
  })
  const data = await gen.json().catch(() => ({}))
  if (!gen.ok || !data.hashed_token) {
    return NextResponse.json(
      { ok: false, error: data.msg || data.error_description || data.message || "génération du lien impossible" },
      { status: 500 }
    )
  }
  const link = `${SITE_URL}/auth/set-password?token_hash=${data.hashed_token}&type=invite`

  let emailSent = false
  try {
    emailSent = await sendInviteEmail(email, link)
  } catch (e) {
    console.error("invite-resend: sendInviteEmail failed:", e)
  }
  console.log(`invite-resend: ${email} email_sent=${emailSent}`)
  return NextResponse.json({ ok: emailSent, email_sent: emailSent }, { status: emailSent ? 200 : 502 })
}
