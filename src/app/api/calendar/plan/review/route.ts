import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"
import { getSessionUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"

// POST { item_id, decision: "valide" | "retours", comment? } : enregistre l'avis de la personne connectée.
// Écriture gated par la section « calendar » (middleware). Rien n'est envoyé ni programmé ici :
// Pilotage lit les revues non traitées et agit (brouillon dans l'outil, maquette refaite).
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 })

    const body = await req.json().catch(() => null)
    const itemId = typeof body?.item_id === "string" ? body.item_id : ""
    const decision = body?.decision
    const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 4000) : ""
    if (!itemId || (decision !== "valide" && decision !== "retours")) {
      return NextResponse.json({ error: "item_id et decision (valide | retours) sont requis" }, { status: 400 })
    }
    if (decision === "retours" && !comment) {
      return NextResponse.json({ error: "écrivez vos retours avant de les envoyer" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: item, error: e1 } = await supabase
      .from("marketing_plan_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle()
    if (e1) throw e1
    if (!item) return NextResponse.json({ error: "ligne introuvable" }, { status: 404 })

    const { data, error } = await supabase
      .from("marketing_plan_reviews")
      .insert({
        item_id: itemId,
        decision,
        comment: comment || null,
        reviewer_email: user.email ?? null,
        reviewer_id: user.id,
      })
      .select("item_id, decision, comment, reviewer_email, created_at, processed, processed_note")
      .single()
    if (error) throw error

    return NextResponse.json({ review: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
