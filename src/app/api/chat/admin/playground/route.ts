import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { getOrCreateConversation } from "@/lib/chat/conversation"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

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
