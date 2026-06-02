import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getGoogleAdsCampaigns } from "@/lib/integrations/google-ads"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Sync Google Ads via l'API REST en Node (cf src/lib/integrations/google-ads.ts).
// Tourne sur Vercel (plus de Python). Appelé par le cron + manuellement.
export async function POST() {
  try {
    if (!process.env.GOOGLE_ADS_REFRESH_TOKEN || !process.env.GOOGLE_ADS_CUSTOMER_ID) {
      return NextResponse.json({ error: "Google Ads credentials not configured" }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const data = await getGoogleAdsCampaigns("THIS_MONTH")

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

    return NextResponse.json({
      success: true,
      campaigns: data.campaigns.length,
      summary: data.summary,
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
