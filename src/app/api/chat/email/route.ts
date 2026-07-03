import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"
import { lookupCustomerByEmail } from "@/lib/chat/shopify-orders"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

// Capture d'email SEULE (ex. « recevoir cette sélection par email » après une
// recommandation produit). Contrairement à /escalate, la conversation RESTE en
// mode bot — on enregistre juste l'email (attribution des ventes + lead SAV)
// et la fidélité cliente (badge inbox).
export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"))
  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body.token === "string" ? body.token : null
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : ""
    if (!token || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "token et email valide requis" }, { status: 400, headers })
    }

    const db = chatDb()
    const { data: conversation } = await db
      .from("chat_conversations")
      .select("id")
      .eq("token", token)
      .single()
    if (!conversation) {
      return NextResponse.json({ error: "conversation inconnue" }, { status: 404, headers })
    }

    // Fidélité captée au passage (1 requête Shopify, non bloquante en cas d'échec).
    let ordersCount: number | null = null
    try {
      const customer = await lookupCustomerByEmail(email)
      if (customer.found) ordersCount = customer.ordersCount
    } catch {
      /* la capture d'email ne doit jamais échouer à cause de Shopify */
    }

    await db
      .from("chat_conversations")
      .update({ visitor_email: email, customer_orders_count: ordersCount })
      .eq("id", conversation.id)

    return NextResponse.json({ ok: true }, { headers })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers })
  }
}
