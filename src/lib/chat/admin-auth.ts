import { NextResponse } from "next/server"

export function requireAdmin(request: Request): NextResponse | null {
  const secret = process.env.CHAT_ADMIN_SECRET
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return null
}
