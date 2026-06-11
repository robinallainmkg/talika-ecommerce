import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { getSettings } from "@/lib/chat/settings"

export const dynamic = "force-dynamic"

const ALLOWED_KEYS = [
  "bot_enabled",
  "business_hours",
  "suggested_questions",
  "daily_limit",
  "offline_message",
  "prompt_addendum",
  "whatsapp_number",
]

export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const settings = await getSettings(chatDb())
    return NextResponse.json({ settings })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const key = body.key as string
    if (!ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "clé non autorisée" }, { status: 400 })
    }
    const { error } = await chatDb()
      .from("chat_settings")
      .upsert({ key, value: body.value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
