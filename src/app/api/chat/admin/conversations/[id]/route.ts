import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const [{ data: conversation }, { data: messages }] = await Promise.all([
      db.from("chat_conversations").select("*").eq("id", params.id).single(),
      db
        .from("chat_messages")
        .select("id, role, content, rag_sources, model, tokens_used, created_at")
        .eq("conversation_id", params.id)
        .order("created_at", { ascending: true })
        .limit(500),
    ])
    if (!conversation) {
      return NextResponse.json({ error: "conversation introuvable" }, { status: 404 })
    }
    await db.from("chat_conversations").update({ unread_count: 0 }).eq("id", params.id)
    return NextResponse.json({ conversation, messages: messages || [] })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const { error } = await db.from("chat_conversations").delete().eq("id", params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
