import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"
// Jamais de cache (cf. incident 03/07 sur le Data Cache Vercel).
export const fetchCache = "force-no-store"

// GET : planning marketing actif (emails + opérations) avec la dernière revue de chaque ligne.
// Alimenté par Pilotage (Claude Code) dans marketing_plan_items ; revues dans marketing_plan_reviews.
export async function GET() {
  try {
    const supabase = createServiceClient()
    const [{ data: items, error: e1 }, { data: reviews, error: e2 }] = await Promise.all([
      supabase
        .from("marketing_plan_items")
        .select("*")
        .eq("active", true)
        .order("date_start", { ascending: true, nullsFirst: false }),
      supabase
        .from("marketing_plan_reviews")
        .select("item_id, decision, comment, reviewer_email, created_at, processed, processed_note")
        .order("created_at", { ascending: false })
        .limit(2000),
    ])
    if (e1) throw e1
    if (e2) throw e2

    // Dernière revue par ligne (les revues sont triées de la plus récente à la plus ancienne).
    const latest: Record<string, any> = {}
    for (const r of reviews || []) if (!latest[r.item_id]) latest[r.item_id] = r

    return NextResponse.json({
      items: (items || []).map((it: any) => ({ ...it, review: latest[it.id] || null })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
