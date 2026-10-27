import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"
import { verifyShareToken, shareTokenId } from "@/lib/share-token"
import { CANCEL_MARK, NOTE_MAX, SHARED_AUTHOR, WRITES_PER_HOUR, foldShared, type FeedbackRow } from "@/lib/plan-feedback"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// POST { t, item_id, action: "valider" | "annuler" | "note", text? } depuis /share/calendar.
// Le jeton signé du lien fait foi (absent, faux ou expiré = 401). Seule écriture possible :
// une ligne dans marketing_plan_reviews (cf. src/lib/plan-feedback.ts). Le planning lui-même
// n'est jamais modifié. Garde-fous : note de 1000 caractères max, 30 écritures par jeton et par heure.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const t = typeof body?.t === "string" ? body.t : ""
    const check = verifyShareToken("calendar", t)
    if (!check.ok) {
      return NextResponse.json({ error: check.reason === "expire" ? "Ce lien a expiré." : "Lien invalide." }, { status: 401 })
    }
    const itemId = typeof body?.item_id === "string" ? body.item_id.slice(0, 200) : ""
    const action = body?.action
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (!itemId || !["valider", "annuler", "note"].includes(action)) {
      return NextResponse.json({ error: "Demande incomplète." }, { status: 400 })
    }
    if (action === "note" && !text) return NextResponse.json({ error: "Écrivez votre note avant de l'enregistrer." }, { status: 400 })
    if (text.length > NOTE_MAX) {
      return NextResponse.json({ error: `Note trop longue (${NOTE_MAX} caractères au plus).` }, { status: 400 })
    }

    const supabase = createServiceClient()
    // Seules les lignes montrées à l'équipe acceptent une note ou une validation.
    const { data: item, error: e1 } = await supabase
      .from("marketing_plan_items")
      .select("id, active, payload")
      .eq("id", itemId)
      .maybeSingle()
    if (e1) throw e1
    if (!item || !item.active || item.payload?.equipe_visible !== true) {
      return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 })
    }

    const tokenId = shareTokenId(t)
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count, error: e2 } = await supabase
      .from("marketing_plan_reviews")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", tokenId)
      .gte("created_at", since)
    if (e2) throw e2
    if ((count ?? 0) >= WRITES_PER_HOUR) {
      return NextResponse.json({ error: "Trop d'enregistrements en une heure. Réessayez un peu plus tard." }, { status: 429 })
    }

    const row =
      action === "valider"
        ? { decision: "valide", comment: null }
        : action === "annuler"
          ? { decision: "retours", comment: CANCEL_MARK }
          : { decision: "retours", comment: text }
    const { error: e3 } = await supabase.from("marketing_plan_reviews").insert({
      item_id: itemId,
      ...row,
      reviewer_email: SHARED_AUTHOR,
      reviewer_id: tokenId,
    })
    if (e3) throw e3

    const { data: rows, error: e4 } = await supabase
      .from("marketing_plan_reviews")
      .select("item_id, decision, comment, reviewer_email, created_at")
      .eq("item_id", itemId)
      .eq("reviewer_email", SHARED_AUTHOR)
    if (e4) throw e4
    const state = foldShared((rows || []) as FeedbackRow[])[itemId] || { validated: null, notes: [] }
    return NextResponse.json({ state })
  } catch (err: any) {
    return NextResponse.json({ error: "Enregistrement impossible pour l'instant." , detail: String(err?.message || err).slice(0, 200) }, { status: 500 })
  }
}
