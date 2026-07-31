/**
 * GET /api/cron/instagram
 *
 * Contenu + stats Instagram (Business Discovery Meta), dans SON PROPRE cron.
 *
 * Pourquoi séparé du cron quotidien : ~88 profils × (1 appel Graph + 250 ms de
 * rate-limit) ≈ 2-3 min, à comparer aux ~3 min du reste du pipeline. Dans
 * runFullSync les deux ne tiennent pas dans les 300 s de la lambda :
 *  - du 3 au 31 juil. 2026, l'étape tournait en 6e position et tuait tout ce qui
 *    suivait (Meta, Google, Klaviyo, P&L, analyse figés au 2 juillet) ;
 *  - passée en dernier, elle se faisait couper elle-même — et surtout la lambda
 *    mourait AVANT l'écriture de `last_cron_sync`, donc l'indicateur de
 *    fraîcheur du dashboard affichait un run vieux d'un mois alors que toutes
 *    les données étaient à jour.
 * Aucun autre calcul ne dépend d'Instagram : un cron à part est la bonne place.
 *
 * Protégé par CRON_SECRET, comme /api/cron/daily.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { syncInstagramContent, instagramConfigured } from "@/lib/influence/instagram"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  if (!instagramConfigured()) {
    return NextResponse.json({ success: true, skipped: "META_ACCESS_TOKEN absent" })
  }

  try {
    // 270 s : marge sous les 300 s de la lambda pour l'écriture de la trace.
    const result = await syncInstagramContent({ budgetMs: 270_000 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    // Trace dédiée : même rôle que last_cron_sync pour le pipeline principal.
    await supabase.from("data_cache").upsert(
      {
        key: "last_instagram_sync",
        data: { ...result, ran_at: new Date().toISOString(), duration_ms: Date.now() - startedAt },
        source: "cron",
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "key" }
    )
    return NextResponse.json({ success: true, duration_ms: Date.now() - startedAt, ...result })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
