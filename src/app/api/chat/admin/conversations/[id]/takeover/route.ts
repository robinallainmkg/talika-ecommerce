import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { agentEmail } from "@/lib/chat/agent-identity"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const SYSTEM_MESSAGES: Record<string, string> = {
  take: "Un conseiller Talika a rejoint la conversation.",
  release: "Vous échangez à nouveau avec l'assistante virtuelle Talika.",
  close: "Conversation clôturée par l'équipe Talika.",
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action as "take" | "release" | "close"
    if (!["take", "release", "close"].includes(action)) {
      return NextResponse.json({ error: "action invalide" }, { status: 400 })
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
    const update: Record<string, unknown> = { last_message_at: now }
    if (action === "take") {
      update.status = "human"
      if (!conversation.taken_over_at) update.taken_over_at = now
      // Attribution : qui gère la conversation (dernier preneur).
      const email = await agentEmail()
      if (email) update.taken_over_by = email
    } else if (action === "release") {
      update.status = "bot"
    } else {
      update.status = "closed"
      update.closed_at = now
    }

    await db.from("chat_messages").insert({
      conversation_id: params.id,
      role: "system",
      content: SYSTEM_MESSAGES[action],
    })
    await db.from("chat_conversations").update(update).eq("id", params.id)

    return NextResponse.json({ ok: true, status: update.status })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
