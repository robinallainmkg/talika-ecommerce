import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data, error } = await supabase
    .from("data_cache")
    .select("key, data, expires_at, created_at")
    .eq("source", "meta")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const cacheMap: Record<string, any> = {}
  for (const row of data || []) {
    cacheMap[row.key] = row.data
  }

  return NextResponse.json({
    campaigns: cacheMap[`meta_campaigns_${year}_${month}`] || null,
    adsets: cacheMap[`meta_adsets_${year}_${month}`] || null,
    ads: cacheMap[`meta_ads_${year}_${month}`] || null,
    monthly: cacheMap[`meta_monthly_${year}_${month}`] || null,
    cached_keys: (data || []).map((r) => ({
      key: r.key,
      expires_at: r.expires_at,
      created_at: r.created_at,
    })),
  })
}
