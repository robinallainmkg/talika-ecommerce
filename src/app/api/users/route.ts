import { NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

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
      user_metadata?: { role?: string; name?: string }
    }) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.name || null,
      role: u.user_metadata?.role || "member",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      pending: !u.last_sign_in_at && !!u.email_confirmed_at === false,
    })
  )
  return NextResponse.json({ users })
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
  return NextResponse.json({ ok: true, email_sent: false, invite_link: result.link })
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
