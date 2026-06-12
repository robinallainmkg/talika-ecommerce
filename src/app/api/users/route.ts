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

// POST — inviter un utilisateur par email (Supabase envoie l'email d'invitation)
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
  if (!response.ok) {
    const message =
      data.msg || data.error_description || data.message || "invitation impossible"
    return NextResponse.json({ error: message }, { status: response.status })
  }
  return NextResponse.json({ ok: true, user: { id: data.id, email: data.email } })
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
