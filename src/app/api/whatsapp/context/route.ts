// Dossier livraison d'un numéro WhatsApp — lecture seule.
// Alimente le panneau latéral du drawer conversation (équivalent de
// /api/chat/admin/conversations/[id]/customer, mais indexé sur le téléphone).
//
// GET /api/whatsapp/context?phone=+336XXXXXXXX
// GET /api/whatsapp/context?conversation=<uuid>

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { buildDeliveryContext } from "@/lib/chat/whatsapp/delivery-context"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const { searchParams } = new URL(request.url)
    let phone = searchParams.get("phone")
    const conversationId = searchParams.get("conversation")

    if (!phone && conversationId) {
      const { data } = await chatDb()
        .from("chat_conversations")
        .select("visitor_phone")
        .eq("id", conversationId)
        .single()
      phone = data?.visitor_phone ?? null
    }
    if (!phone) return NextResponse.json({ error: "phone ou conversation requis" }, { status: 400 })

    return NextResponse.json(await buildDeliveryContext(phone))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
