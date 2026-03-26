import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
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
