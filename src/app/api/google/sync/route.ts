import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getGoogleAdsCampaigns, type GoogleAdsResult } from "@/lib/integrations/google-ads"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min (Vercel Pro) — évite le timeout du bouton sync

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Sync Google Ads via l'API REST en Node (cf src/lib/integrations/google-ads.ts).
// Tourne sur Vercel (plus de Python). Appelé par le cron + manuellement.
//
// Par défaut, synchronise le mois COURANT *et* le mois PRÉCÉDENT : le mois courant
// est forcément partiel (month-to-date) et le précédent doit être figé sur son total
// RÉEL une fois clos. Resynchroniser le mois précédent chaque jour le verrouille
// proprement (sinon il reste gelé sur le dernier partial — bug spend mois/mois).
// Un body { year, month } force un mois précis (backfill ponctuel).
export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_ADS_REFRESH_TOKEN || !process.env.GOOGLE_ADS_CUSTOMER_ID) {
      return NextResponse.json({ error: "Google Ads credentials not configured" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")

    // Quels mois synchroniser ?
    const targets: Array<{ year: number; month: number }> = []
    if (body.year && body.month) {
      targets.push({ year: body.year, month: body.month })
    } else {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      targets.push({ year: now.getFullYear(), month: now.getMonth() + 1 })
      targets.push({ year: prev.getFullYear(), month: prev.getMonth() + 1 })
    }

    const results: Array<{ year: number; month: number; campaigns: number; summary: GoogleAdsResult["summary"] }> = []

    for (const { year, month } of targets) {
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
      const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
      const since = `${year}-${pad(month)}-01`
      const until = `${year}-${pad(month)}-${pad(lastDay)}`

      const data = await getGoogleAdsCampaigns({ since, until })

      const { error } = await supabase.from("data_cache").upsert(
        {
          key: `google_ads_${year}_${month}`,
          data,
          source: "google_ads",
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "key" }
      )
      if (error) throw new Error(error.message)

      results.push({ year, month, campaigns: data.campaigns.length, summary: data.summary })
    }

    return NextResponse.json({
      success: true,
      // rétro-compat : champs du mois courant (1er target)
      campaigns: results[0].campaigns,
      summary: results[0].summary,
      months: results.map((r) => ({ year: r.year, month: r.month, spend: r.summary.spend })),
    })
  } catch (error) {
    console.error("Google Ads sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  const now = new Date()
  const { data } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", `google_ads_${now.getFullYear()}_${now.getMonth() + 1}`)
    .single()

  return NextResponse.json(data?.data || { campaigns: [], summary: {} })
}
