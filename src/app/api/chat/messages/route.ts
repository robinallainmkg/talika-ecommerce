import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    const after = searchParams.get("after")
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
    let query = db
      .from("chat_messages")
      .select("id, role, content, product_refs, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(100)
    if (after) query = query.gt("created_at", after)
    const { data: messages } = await query
    return NextResponse.json({ status: conversation.status, messages: messages || [] }, { headers })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
