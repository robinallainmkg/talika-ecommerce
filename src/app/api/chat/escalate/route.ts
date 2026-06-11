import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === "string" ? body.token : null
    if (!token) {
      return NextResponse.json({ error: "token requis" }, { status: 400, headers })
    }
    const db = chatDb()
    const { data: conversation } = await db
      .from("chat_conversations")
      .select("id, status")
      .eq("token", token)
      .single()
    if (!conversation) {
      return NextResponse.json({ error: "conversation inconnue" }, { status: 404, headers })
    }

    const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : null
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : null

    const rows: Record<string, unknown>[] = []
    if (message) {
      rows.push({ conversation_id: conversation.id, role: "user", content: message })
    }
    rows.push({
      conversation_id: conversation.id,
      role: "system",
      content: "Demande transmise à l'équipe Talika.",
    })
    await db.from("chat_messages").insert(rows)

    const update: Record<string, unknown> = {
      status: "queued",
      last_message_at: new Date().toISOString(),
    }
    if (email) update.visitor_email = email
    await db.from("chat_conversations").update(update).eq("id", conversation.id)

    return NextResponse.json({ ok: true, status: "queued" }, { headers })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
