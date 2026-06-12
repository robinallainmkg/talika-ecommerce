import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"
import { clientIp } from "@/lib/chat/rate-limit"
import { lookupOrder, buildOrderMessage } from "@/lib/chat/shopify-orders"

export const dynamic = "force-dynamic"

const LOOKUPS_PER_HOUR = 6

const NOT_FOUND_MESSAGE =
  "Je ne trouve aucune commande correspondant à ce numéro et cet email. Vérifiez le numéro (il figure dans votre email de confirmation, ex. #12345) et l'adresse email utilisée lors de l'achat — ou laissez un message à notre équipe via « Parler à un conseiller »."

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === "string" ? body.token : null
    const orderNumber = typeof body.order_number === "string" ? body.order_number.slice(0, 30) : ""
    const email = typeof body.email === "string" ? body.email.slice(0, 200) : ""
    if (!token || !orderNumber || !email) {
      return NextResponse.json({ error: "token, order_number et email requis" }, { status: 400, headers })
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
      const key = `order:${ip}:${hour}`
      const { data: rl } = await db.from("chat_rate_limits").select("message_count").eq("key", key).single()
      const count = rl?.message_count || 0
      if (count >= LOOKUPS_PER_HOUR) {
        return NextResponse.json(
          { error: "rate_limit", message: "Trop de tentatives. Réessayez dans une heure ou laissez un message à notre équipe." },
          { status: 429, headers }
        )
      }
      await db.from("chat_rate_limits").upsert(
        { key, message_count: count + 1, window_start: new Date().toISOString(), hourly_count: 0, hourly_start: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
    }

    const order = await lookupOrder(orderNumber, email)
    const message = order ? buildOrderMessage(order) : NOT_FOUND_MESSAGE

    await db.from("chat_messages").insert([
      { conversation_id: conversation.id, role: "user", content: `Suivi de commande ${orderNumber.startsWith("#") ? orderNumber : "#" + orderNumber}` },
      { conversation_id: conversation.id, role: "assistant", content: message, model: "order-lookup" },
    ])
    await db
      .from("chat_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id)

    return NextResponse.json({ found: !!order, message }, { headers })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
