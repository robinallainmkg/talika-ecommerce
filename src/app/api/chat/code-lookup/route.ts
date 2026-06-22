import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"
import { clientIp } from "@/lib/chat/rate-limit"
import { lookupDiscountCode, buildDiscountMessage } from "@/lib/chat/shopify-discounts"

export const dynamic = "force-dynamic"

// Anti-énumération de codes (les codes privés ne doivent pas être brute-forçables).
const LOOKUPS_PER_HOUR = 8

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === "string" ? body.token : null
    const code = typeof body.code === "string" ? body.code.slice(0, 60).trim() : ""
    if (!token || !code) {
      return NextResponse.json({ error: "token et code requis" }, { status: 400, headers })
    }

    const db = chatDb()
    const { data: conversation } = await db
      .from("chat_conversations")
      .select("id, is_internal")
      .eq("token", token)
      .single()
    if (!conversation) {
      return NextResponse.json({ error: "conversation inconnue" }, { status: 404, headers })
    }

    // Anti-énumération : peu de tentatives par IP, fenêtre 1 h
    const ip = clientIp(request)
    if (ip !== "unknown" && !conversation.is_internal) {
      const hour = new Date().toISOString().slice(0, 13)
      const key = `code:${ip}:${hour}`
      const { data: rl } = await db.from("chat_rate_limits").select("message_count").eq("key", key).single()
      const count = rl?.message_count || 0
      if (count >= LOOKUPS_PER_HOUR) {
        return NextResponse.json(
          { error: "rate_limit", message: "Trop de vérifications. Réessayez dans une heure ou laissez un message à notre équipe." },
          { status: 429, headers }
        )
      }
      await db.from("chat_rate_limits").upsert(
        { key, message_count: count + 1, window_start: new Date().toISOString(), hourly_count: 0, hourly_start: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
    }

    const info = await lookupDiscountCode(code)
    const message = buildDiscountMessage(code, info)

    await db.from("chat_messages").insert([
      { conversation_id: conversation.id, role: "user", content: `Vérifier le code ${code.toUpperCase()}` },
      { conversation_id: conversation.id, role: "assistant", content: message, model: "code-lookup" },
    ])
    await db
      .from("chat_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)

    return NextResponse.json({ found: info.found, active: info.active, message }, { headers })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
