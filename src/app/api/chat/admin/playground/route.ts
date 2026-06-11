import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { getOrCreateConversation } from "@/lib/chat/conversation"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const conversation = await getOrCreateConversation(db, {
      pageUrl: "playground",
      isInternal: true,
    })
    return NextResponse.json({ token: conversation.token, conversation_id: conversation.id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
