import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fetch Google Ads data via Python (uses google-ads gRPC library)
function fetchGoogleAdsData(period: "THIS_MONTH" | "LAST_MONTH" | "LAST_30_DAYS"): any {
  const script = `
import json, warnings
warnings.filterwarnings("ignore")
from google.ads.googleads.client import GoogleAdsClient

config = {
    'developer_token': '${process.env.GOOGLE_ADS_DEVELOPER_TOKEN}',
    'client_id': '${process.env.GOOGLE_CLIENT_ID}',
    'client_secret': '${process.env.GOOGLE_CLIENT_SECRET}',
    'refresh_token': '${process.env.GOOGLE_ADS_REFRESH_TOKEN}',
    'use_proto_plus': True,
}

client = GoogleAdsClient.load_from_dict(config)
ga_service = client.get_service('GoogleAdsService')
cid = '${process.env.GOOGLE_ADS_CUSTOMER_ID}'

# Campaign data
query = """
SELECT
  campaign.name, campaign.status,
  metrics.cost_micros, metrics.impressions, metrics.clicks,
  metrics.conversions, metrics.conversions_value,
  metrics.average_cpc, metrics.ctr
FROM campaign
WHERE segments.date DURING ${period}
ORDER BY metrics.cost_micros DESC
"""
response = ga_service.search(customer_id=cid, query=query)

campaigns = []
total = {'spend': 0, 'impressions': 0, 'clicks': 0, 'conversions': 0, 'conversions_value': 0}

for row in response:
    spend = row.metrics.cost_micros / 1_000_000
    if spend == 0 and row.metrics.clicks == 0:
        continue
    c = {
        'name': row.campaign.name,
        'status': row.campaign.status.name,
        'spend': round(spend, 2),
        'impressions': row.metrics.impressions,
        'clicks': row.metrics.clicks,
        'conversions': round(row.metrics.conversions, 1),
        'conversions_value': round(row.metrics.conversions_value, 2),
        'roas': round(row.metrics.conversions_value / spend, 1) if spend > 0 else 0,
        'cpc': round(row.metrics.average_cpc / 1_000_000, 2) if row.metrics.average_cpc else 0,
        'ctr': round(row.metrics.ctr * 100, 2) if row.metrics.ctr else 0,
    }
    campaigns.append(c)
    total['spend'] += spend
    total['impressions'] += row.metrics.impressions
    total['clicks'] += row.metrics.clicks
    total['conversions'] += row.metrics.conversions
    total['conversions_value'] += row.metrics.conversions_value

total['roas'] = round(total['conversions_value'] / total['spend'], 1) if total['spend'] > 0 else 0
total['cpc'] = round(total['spend'] / total['clicks'], 2) if total['clicks'] > 0 else 0

print(json.dumps({'campaigns': campaigns, 'summary': total}))
`

  const result = execSync(`python3 -c '${script.replace(/'/g, "'\"'\"'")}'`, {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
  })

  return JSON.parse(result.trim())
}

export async function POST() {
  try {
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_CUSTOMER_ID) {
      return NextResponse.json({ error: "Google Ads credentials not configured" }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // Fetch current month data
    const data = fetchGoogleAdsData("THIS_MONTH")

    // Store in data_cache
    await supabase.from("data_cache").upsert({
      key: `google_ads_${year}_${month}`,
      data,
      source: "google_ads",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })

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
    .select("data, created_at")
    .eq("key", `google_ads_${now.getFullYear()}_${now.getMonth() + 1}`)
    .single()

  return NextResponse.json(data?.data || { campaigns: [], summary: {} })
}
