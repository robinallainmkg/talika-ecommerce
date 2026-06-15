import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { lookupCustomerByEmail } from "@/lib/chat/shopify-orders"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const { data: conversation } = await db
      .from("chat_conversations")
      .select("visitor_email")
      .eq("id", params.id)
      .single()
    if (!conversation) {
      return NextResponse.json({ error: "conversation introuvable" }, { status: 404 })
    }
    if (!conversation.visitor_email) {
      return NextResponse.json({ found: false, email: null, ordersCount: 0, orders: [] })
    }
    const customer = await lookupCustomerByEmail(conversation.visitor_email)
    return NextResponse.json({ ...customer, email: conversation.visitor_email })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
