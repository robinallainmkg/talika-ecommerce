import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"
import { getSettings, isWithinBusinessHours, BusinessHours } from "@/lib/chat/settings"
import { getOrCreateConversation } from "@/lib/chat/conversation"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const body = await request.json().catch(() => ({}))
    const db = chatDb()

    const conversation = await getOrCreateConversation(db, {
      token: typeof body.token === "string" ? body.token : null,
      pageUrl: typeof body.page_url === "string" ? body.page_url.slice(0, 500) : null,
      userAgent: request.headers.get("user-agent"),
    })

    const [{ data: messages }, settings] = await Promise.all([
      db
        .from("chat_messages")
        .select("id, role, content, product_refs, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(50),
      getSettings(db, ["suggested_questions", "business_hours", "bot_enabled"]),
    ])

    return NextResponse.json(
      {
        token: conversation.token,
        conversation_id: conversation.id,
        status: conversation.status,
        messages: (messages || []).reverse(),
        suggested_questions: settings.suggested_questions || [],
        online: isWithinBusinessHours(settings.business_hours as BusinessHours),
        bot_enabled: settings.bot_enabled !== false,
        has_email: !!conversation.visitor_email,
      },
      { headers }
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
