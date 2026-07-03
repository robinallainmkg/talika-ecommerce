import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { lookupCustomerByEmail } from "@/lib/chat/shopify-orders"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

// Fenêtre d'attribution : une commande passée dans les 7 jours suivant une
// conversation (email identique) est créditée au chat. Si la conversation a été
// prise en main (taken_over_by), la vente est créditée à cet agent (ex. Meha =
// contact@talika.com), sinon au bot. Une commande n'est attribuée qu'UNE fois,
// à la conversation la plus proche qui la précède.
const ATTRIBUTION_WINDOW_MS = 7 * 24 * 3600 * 1000

type AttributedOrder = {
  order: string
  date: string
  amount: number
  products: string
  email: string
  handler: string // "bot" | email agent
  conversation_id: string
}

export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const { data: convs, error } = await db
      .from("chat_conversations")
      .select("id, visitor_email, created_at, taken_over_by")
      .eq("is_internal", false)
      .not("visitor_email", "is", null)
      .order("created_at", { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byEmail = new Map<string, { id: string; created_at: string; taken_over_by: string | null }[]>()
    for (const c of convs || []) {
      const email = (c.visitor_email || "").toLowerCase().trim()
      if (!email) continue
      if (!byEmail.has(email)) byEmail.set(email, [])
      byEmail.get(email)!.push(c)
    }

    const attributed: AttributedOrder[] = []
    for (const [email, list] of byEmail) {
      const customer = await lookupCustomerByEmail(email)
      if (!customer.found) continue
      for (const order of customer.orders) {
        const orderTime = new Date(order.createdAt).getTime()
        // Conversation la plus récente qui précède la commande, dans la fenêtre.
        const match = [...list]
          .reverse()
          .find((c) => {
            const t = new Date(c.created_at).getTime()
            return t <= orderTime && orderTime - t <= ATTRIBUTION_WINDOW_MS
          })
        if (!match) continue
        attributed.push({
          order: order.name,
          date: order.createdAt,
          amount: parseFloat(order.total || "0"),
          products: order.products.map((p) => `${p.quantity}× ${p.title}`).join(", "),
          email,
          handler: match.taken_over_by || "bot",
          conversation_id: match.id,
        })
      }
    }

    const summary: Record<string, { revenue: number; orders: number }> = {}
    let total = 0
    for (const a of attributed) {
      if (!summary[a.handler]) summary[a.handler] = { revenue: 0, orders: 0 }
      summary[a.handler].revenue += a.amount
      summary[a.handler].orders += 1
      total += a.amount
    }

    return NextResponse.json({
      total_revenue: Math.round(total * 100) / 100,
      orders_count: attributed.length,
      conversations_with_email: (convs || []).length,
      by_handler: summary,
      orders: attributed.sort((a, b) => (a.date < b.date ? 1 : -1)),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
