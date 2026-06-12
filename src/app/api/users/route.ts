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

// Génère un lien d'activation SANS envoi d'email (plan B quand le SMTP est limité).
// Si un compte en attente existe déjà, il est recréé proprement.
async function generateInviteLink(email: string, role: string, invitedBy: string): Promise<string | null> {
  const existing = await findUserByEmail(email)
  if (existing) {
    if (existing.last_sign_in_at) return null // compte actif : ne pas y toucher
    await fetch(`${AUTH_ADMIN}/admin/users/${existing.id}`, { method: "DELETE", headers: adminHeaders() })
  }
  const response = await fetch(`${AUTH_ADMIN}/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ type: "invite", email, data: { role, invited_by: invitedBy } }),
  })
  const data = await response.json()
  if (!response.ok || !data.hashed_token) return null
  return `${SITE_URL}/auth/set-password?token_hash=${data.hashed_token}&type=invite`
}

// POST — inviter un utilisateur par email (Supabase envoie l'email d'invitation ;
// si l'envoi échoue — rate limit SMTP — on renvoie un lien d'activation à transmettre)
export async function POST(request: Request) {
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const role = body.role === "admin" ? "admin" : "member"
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email invalide" }, { status: 400 })
  }

  const response = await fetch(`${AUTH_ADMIN}/invite`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      data: { role, invited_by: auth.user.email },
      redirect_to: `${SITE_URL}/auth/set-password`,
    }),
  })
  const data = await response.json()
  if (response.ok) {
    return NextResponse.json({ ok: true, email_sent: true, user: { id: data.id, email: data.email } })
  }

  // Plan B : lien d'activation sans email (rate limit SMTP ou invitation déjà en attente)
  const inviteLink = await generateInviteLink(email, role, auth.user.email || "admin")
  if (inviteLink) {
    return NextResponse.json({ ok: true, email_sent: false, invite_link: inviteLink })
  }

  const message = data.msg || data.error_description || data.message || "invitation impossible"
  return NextResponse.json({ error: message }, { status: response.status })
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
