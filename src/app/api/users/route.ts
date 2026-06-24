import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/auth/server"
import { sendInviteEmail } from "@/lib/mailer"
import { GRANTABLE_SECTIONS } from "@/lib/roles"

export const dynamic = "force-dynamic"
export const maxDuration = 30 // l'envoi SMTP peut prendre quelques secondes

const AUTH_ADMIN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
const SITE_URL = "https://talika-ecommerce.vercel.app"

function adminHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
}

// GET — liste des utilisateurs
export async function GET() {
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const response = await fetch(`${AUTH_ADMIN}/admin/users?per_page=100`, { headers: adminHeaders() })
  if (!response.ok) {
    return NextResponse.json({ error: "lecture des utilisateurs impossible" }, { status: 500 })
  }
  const data = await response.json()
  const users = (data.users || []).map(
    (u: {
      id: string
      email: string
      created_at: string
      last_sign_in_at: string | null
      email_confirmed_at: string | null
      user_metadata?: { role?: string; name?: string; sections?: string[] }
    }) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name || null,
      role: u.user_metadata?.role || "member",
      sections: Array.isArray(u.user_metadata?.sections) ? u.user_metadata!.sections : null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      pending: !u.last_sign_in_at && !!u.email_confirmed_at === false,
    })
  )
  return NextResponse.json({ users })
}

// PATCH — modifier le rôle et/ou les sections d'un membre (accès modulable).
// On fusionne avec les métadonnées existantes (on ne perd ni le nom ni le reste).
export async function PATCH(request: Request) {
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  // Récupère les métadonnées actuelles pour les fusionner (merge sûr).
  const cur = await fetch(`${AUTH_ADMIN}/admin/users/${id}`, { headers: adminHeaders() })
  if (!cur.ok) return NextResponse.json({ error: "utilisateur introuvable" }, { status: 404 })
  const curUser = await cur.json()
  const meta: Record<string, unknown> = { ...(curUser.user_metadata || {}) }

  const ALLOWED_ROLES = ["admin", "member", "influence", "sav"]
  if (typeof body.role === "string" && ALLOWED_ROLES.includes(body.role)) meta.role = body.role
  if (Array.isArray(body.sections)) {
    meta.sections = body.sections.filter((s: unknown): s is string => typeof s === "string" && GRANTABLE_SECTIONS.includes(s))
  }

  // Anti-verrouillage : l'admin ne peut pas se retirer son propre rôle admin.
  if (id === auth.user.id && meta.role !== "admin") {
    return NextResponse.json({ error: "tu ne peux pas retirer ton propre accès admin" }, { status: 400 })
  }

  const upd = await fetch(`${AUTH_ADMIN}/admin/users/${id}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify({ user_metadata: meta }),
  })
  if (!upd.ok) return NextResponse.json({ error: "mise à jour impossible" }, { status: 500 })
  return NextResponse.json({ ok: true, role: meta.role, sections: meta.sections ?? null })
}

async function findUserByEmail(email: string): Promise<{ id: string; last_sign_in_at: string | null } | null> {
  const response = await fetch(`${AUTH_ADMIN}/admin/users?per_page=200`, { headers: adminHeaders() })
  if (!response.ok) return null
  const data = await response.json()
  const user = (data.users || []).find((u: { email: string }) => u.email === email)
  return user ? { id: user.id, last_sign_in_at: user.last_sign_in_at } : null
}

// Génère un lien d'activation (token_hash) SANS envoi d'email — consommé par
// /auth/set-password via verifyOtp. Si un compte EN ATTENTE existe déjà, on le
// recrée proprement pour régénérer un lien frais. Renvoie le lien ou une raison.
async function generateInviteLink(
  email: string,
  role: string,
  invitedBy: string
): Promise<{ link: string } | { error: string }> {
  const existing = await findUserByEmail(email)
  if (existing) {
    if (existing.last_sign_in_at) return { error: "cette personne a déjà un compte actif" }
    await fetch(`${AUTH_ADMIN}/admin/users/${existing.id}`, { method: "DELETE", headers: adminHeaders() })
  }
  const response = await fetch(`${AUTH_ADMIN}/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ type: "invite", email, data: { role, invited_by: invitedBy } }),
  })
  const data = await response.json()
  if (!response.ok || !data.hashed_token) {
    return { error: data.msg || data.error_description || data.message || "génération du lien impossible" }
  }
  return { link: `${SITE_URL}/auth/set-password?token_hash=${data.hashed_token}&type=invite` }
}

// POST — créer une invitation. On NE compte PAS sur l'email Supabase : il part du
// domaine partagé mail.app.supabase.io, non autorisé pour @talika.com → rejeté/
// spam (vérifié via les logs auth). On génère donc TOUJOURS un lien d'activation
// que l'admin transmet lui-même. Pour réactiver l'envoi auto : SMTP custom (CLAUDE.md §14).
export async function POST(request: Request) {
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const ALLOWED_ROLES = ["admin", "member", "influence", "sav"]
  const role = ALLOWED_ROLES.includes(body.role) ? body.role : "member"
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email invalide" }, { status: 400 })
  }

  const result = await generateInviteLink(email, role, auth.user.email || "admin")
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  // Envoi auto par email SI un SMTP custom est configuré (vars SMTP_* Vercel) ;
  // sinon le lien d'activation reste le mécanisme de secours, toujours renvoyé.
  let emailSent = false
  try {
    emailSent = await sendInviteEmail(email, result.link)
  } catch (e) {
    console.error("sendInviteEmail failed:", e)
  }

  return NextResponse.json({ ok: true, email_sent: emailSent, invite_link: result.link })
}

// DELETE — révoquer un utilisateur
export async function DELETE(request: Request) {
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  if (id === auth.user.id) {
    return NextResponse.json({ error: "impossible de supprimer son propre compte" }, { status: 400 })
  }

  const response = await fetch(`${AUTH_ADMIN}/admin/users/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  })
  if (!response.ok) {
    return NextResponse.json({ error: "suppression impossible" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
