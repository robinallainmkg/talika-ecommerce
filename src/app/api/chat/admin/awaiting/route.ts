import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { AUTO_HANDLED } from "@/lib/chat/awaiting"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

// GET /api/chat/admin/awaiting — fils SAV qui attendent une action HUMAINE
// (règle Robin 10/08 : 1 action nécessaire d'un humain = +1). Alimente le badge
// rouge « SAV » de la sidebar et les notifications globales.
export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const { data: conversations, error } = await db
      .from("chat_conversations")
      .select("id, status, channel, visitor_email, visitor_phone, last_message_at")
      .eq("is_internal", false)
      .in("status", ["queued", "human"])
      .gt("message_count", 0)
      .order("last_message_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Dernier message de chaque fil, en un seul round-trip (même approximation
    // que la liste admin : ×6 messages triés desc couvre largement les fils
    // récents ; un fil au-delà serait de toute façon hors des 200 plus actifs).
    const ids = (conversations || []).map((c) => c.id)
    const lastByConv = new Map<string, { role: string; content: string }>()
    if (ids.length > 0) {
      const { data: messages } = await db
        .from("chat_messages")
        .select("conversation_id, role, content, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(ids.length * 6)
      for (const m of messages || []) {
        if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
      }
    }

    const items = (conversations || [])
      .filter((c) => {
        if (c.status === "queued") return true
        const last = lastByConv.get(c.id)
        if (!last || last.role !== "user") return false
        return !AUTO_HANDLED.test(last.content || "")
      })
      .map((c) => ({
        id: c.id,
        status: c.status,
        channel: c.channel,
        contact: c.visitor_email || c.visitor_phone || null,
        last_message_at: c.last_message_at,
        preview: (lastByConv.get(c.id)?.content || "").slice(0, 120),
      }))

    return NextResponse.json({ count: items.length, items })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
