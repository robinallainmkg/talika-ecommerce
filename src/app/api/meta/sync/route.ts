import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || ""
// Strip act_ prefix if present — the code already prepends it
const RAW_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || ""
const META_AD_ACCOUNT_ID = RAW_AD_ACCOUNT_ID.replace(/^act_/, "")
const META_API_VERSION = "v21.0"

async function metaFetch(endpoint: string, params?: Record<string, string>) {
  const query = new URLSearchParams({
    access_token: META_ACCESS_TOKEN,
    ...params,
  })
  const url = `https://graph.facebook.com/${META_API_VERSION}${endpoint}?${query}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta API error ${res.status}: ${body}`)
  }
  return res.json()
}

function extractPurchases(actions?: Array<{ action_type: string; value: string }>) {
  if (!actions) return 0
  const purchase = actions.find((a) => a.action_type === "purchase")
  return purchase ? parseFloat(purchase.value) : 0
}

function extractROAS(purchaseRoas?: Array<{ action_type: string; value: string }>) {
  if (!purchaseRoas || purchaseRoas.length === 0) return 0
  return parseFloat(purchaseRoas[0].value) || 0
}

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 min (Vercel Pro) — évite le timeout du bouton sync

export async function POST(request: Request) {
  try {
    if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
      return NextResponse.json(
        { error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured" },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const now = new Date()
    const year = body.year || now.getFullYear()
    const month = body.month || (now.getMonth() + 1)
    const isCurrentMonth = year === now.getFullYear() && month === (now.getMonth() + 1)
    const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
    const since = `${year}-${String(month).padStart(2, "0")}-01`
    const until = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

    // --- Fetch campaign-level insights for current month ---
    const campaignData = await metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, {
      fields: "campaign_name,campaign_id,spend,impressions,clicks,actions,cost_per_action_type,purchase_roas,cpc,cpm,ctr",
      time_range: JSON.stringify({ since, until }),
      level: "campaign",
      limit: "500",
    })

    const campaigns = (campaignData.data || []).map((row: any) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0", 10),
      clicks: parseInt(row.clicks || "0", 10),
      cpc: parseFloat(row.cpc || "0"),
      cpm: parseFloat(row.cpm || "0"),
      ctr: parseFloat(row.ctr || "0"),
      purchases: extractPurchases(row.actions),
      roas: extractROAS(row.purchase_roas),
    }))

    // --- Fetch adset-level (ad group) insights for current month ---
    const adsetData = await metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, {
      fields: "adset_name,adset_id,campaign_name,campaign_id,spend,impressions,clicks,actions,cost_per_action_type,purchase_roas,cpc,cpm,ctr",
      time_range: JSON.stringify({ since, until }),
      level: "adset",
      limit: "500",
    })

    const adsets = (adsetData.data || []).map((row: any) => ({
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0", 10),
      clicks: parseInt(row.clicks || "0", 10),
      cpc: parseFloat(row.cpc || "0"),
      cpm: parseFloat(row.cpm || "0"),
      ctr: parseFloat(row.ctr || "0"),
      purchases: extractPurchases(row.actions),
      roas: extractROAS(row.purchase_roas),
    }))

    // --- Fetch ad-level (individual ads) insights for current month ---
    const adData = await metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, {
      fields: "ad_name,ad_id,adset_name,adset_id,campaign_name,campaign_id,spend,impressions,clicks,actions,cost_per_action_type,purchase_roas,cpc,cpm,ctr",
      time_range: JSON.stringify({ since, until }),
      level: "ad",
      limit: "500",
    })

    const ads = (adData.data || []).map((row: any) => ({
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0", 10),
      clicks: parseInt(row.clicks || "0", 10),
      cpc: parseFloat(row.cpc || "0"),
      cpm: parseFloat(row.cpm || "0"),
      ctr: parseFloat(row.ctr || "0"),
      purchases: extractPurchases(row.actions),
      roas: extractROAS(row.purchase_roas),
    }))

    // --- Fetch account-level monthly summary ---
    const summaryData = await metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, {
      fields: "spend,impressions,clicks,actions,cost_per_action_type,purchase_roas,cpc,cpm,ctr",
      time_range: JSON.stringify({ since, until }),
      level: "account",
    })

    const summaryRow = summaryData.data?.[0] || {}
    const monthlySummary = {
      spend: parseFloat(summaryRow.spend || "0"),
      impressions: parseInt(summaryRow.impressions || "0", 10),
      clicks: parseInt(summaryRow.clicks || "0", 10),
      cpc: parseFloat(summaryRow.cpc || "0"),
      cpm: parseFloat(summaryRow.cpm || "0"),
      ctr: parseFloat(summaryRow.ctr || "0"),
      purchases: extractPurchases(summaryRow.actions),
      roas: extractROAS(summaryRow.purchase_roas),
    }

    // --- Fetch last 6 months for trend ---
    const monthlyTrend: Array<{ month: string; spend: number; roas: number; purchases: number }> = []

    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      const mSince = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const mUntil = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

      try {
        const mData = await metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, {
          fields: "spend,actions,purchase_roas",
          time_range: JSON.stringify({ since: mSince, until: mUntil }),
          level: "account",
        })
        const mRow = mData.data?.[0]
        monthlyTrend.push({
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          spend: mRow ? parseFloat(mRow.spend || "0") : 0,
          roas: mRow ? extractROAS(mRow.purchase_roas) : 0,
          purchases: mRow ? extractPurchases(mRow.actions) : 0,
        })
      } catch {
        monthlyTrend.push({
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          spend: 0,
          roas: 0,
          purchases: 0,
        })
      }
    }

    // --- Store in Supabase data_cache ---
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h TTL

    const { error: err1 } = await supabase.from("data_cache").upsert({
      key: `meta_campaigns_${year}_${month}`,
      data: { campaigns, fetched_at: now.toISOString() },
      source: "meta",
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: "key" })
    if (err1) console.error("Meta campaigns upsert error:", err1)

    const { error: errAdsets } = await supabase.from("data_cache").upsert({
      key: `meta_adsets_${year}_${month}`,
      data: { adsets, fetched_at: now.toISOString() },
      source: "meta",
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: "key" })
    if (errAdsets) console.error("Meta adsets upsert error:", errAdsets)

    const { error: errAds } = await supabase.from("data_cache").upsert({
      key: `meta_ads_${year}_${month}`,
      data: { ads, fetched_at: now.toISOString() },
      source: "meta",
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: "key" })
    if (errAds) console.error("Meta ads upsert error:", errAds)

    const { error: err2 } = await supabase.from("data_cache").upsert({
      key: `meta_monthly_${year}_${month}`,
      data: { summary: monthlySummary, trend: monthlyTrend, fetched_at: now.toISOString() },
      source: "meta",
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: "key" })
    if (err2) console.error("Meta monthly upsert error:", err2)

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      results: {
        campaigns_count: campaigns.length,
        adsets_count: adsets.length,
        ads_count: ads.length,
        summary: monthlySummary,
        trend_months: monthlyTrend.length,
      },
    })
  } catch (error) {
    console.error("Meta sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta sync failed" },
      { status: 500 }
    )
  }
}
