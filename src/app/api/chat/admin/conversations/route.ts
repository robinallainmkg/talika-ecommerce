import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const internal = searchParams.get("internal") === "true"
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)

    const db = chatDb()
    let query = db
      .from("chat_conversations")
      .select(
        "id, status, is_internal, channel, visitor_phone, visitor_email, visitor_name, first_page_url, message_count, unread_count, last_message_at, created_at, customer_orders_count, taken_over_by, service_window_expires_at"
      )
      .eq("is_internal", internal)
      .gt("message_count", 0)
      .order("last_message_at", { ascending: false })
      .limit(limit)
    if (status && status !== "all") query = query.eq("status", status)

    const { data: conversations, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = (conversations || []).map((c) => c.id)
    const previews = new Map<string, string>()
    if (ids.length > 0) {
      const { data: messages } = await db
        .from("chat_messages")
        .select("conversation_id, content, role, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(ids.length * 8)
      for (const m of messages || []) {
        if (!previews.has(m.conversation_id)) {
          previews.set(
            m.conversation_id,
            `${m.role === "user" ? "Visiteur : " : ""}${m.content.slice(0, 120)}`
          )
        }
      }
    }
    const enriched = (conversations || []).map((conv) => ({
      ...conv,
      last_message_preview: previews.get(conv.id) || "",
    }))

    return NextResponse.json({ conversations: enriched })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
