import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { agentEmail } from "@/lib/chat/agent-identity"

export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === "string" ? body.content.trim() : ""
    if (!content) {
      return NextResponse.json({ error: "message vide" }, { status: 400 })
    }

    const db = chatDb()
    const { data: conversation } = await db
      .from("chat_conversations")
      .select("id, status, taken_over_at")
      .eq("id", params.id)
      .single()
    if (!conversation) {
      return NextResponse.json({ error: "conversation introuvable" }, { status: 404 })
    }

    const now = new Date().toISOString()
    const email = await agentEmail()

    // Auto-prise en main : répondre fait basculer la conversation en mode humain.
    if (conversation.status !== "human") {
      const update: Record<string, unknown> = { status: "human", last_message_at: now }
      if (!conversation.taken_over_at) update.taken_over_at = now
      if (email) update.taken_over_by = email
      await db.from("chat_conversations").update(update).eq("id", params.id)
      if (conversation.status === "bot") {
        await db.from("chat_messages").insert({
          conversation_id: params.id,
          role: "system",
          content: "Un conseiller Talika a rejoint la conversation.",
        })
      }
    }

    const { data: message, error } = await db
      .from("chat_messages")
      .insert({ conversation_id: params.id, role: "agent", content, agent_email: email })
      .select("id, role, content, created_at")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await db
      .from("chat_conversations")
      .update({ last_message_at: now, unread_count: 0 })
      .eq("id", params.id)

    return NextResponse.json({ ok: true, message })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
