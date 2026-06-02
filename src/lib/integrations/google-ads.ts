/**
 * Google Ads API — intégration Node / REST (PAS de Python → tourne sur Vercel).
 *
 * Auth : refresh token OAuth (var d'env GOOGLE_ADS_REFRESH_TOKEN).
 * Pour RÉGÉNÉRER le token quand il est mort : voir CLAUDE.md §13 (flux /api/google/callback).
 *
 * C'est LA seule implémentation Google Ads (l'ancienne version Python a été supprimée).
 */

const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "")
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ""
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || ""
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
const API_VERSION = "v21" // version REST courante (testée 2026-06)

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`OAuth Google: ${data.error || "no access_token"} ${data.error_description || ""}`.trim())
  }
  return data.access_token
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function search(query: string): Promise<any[]> {
  const token = await getAccessToken()
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${CUSTOMER_ID}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": DEVELOPER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  )
  if (!res.ok) {
    throw new Error(`Google Ads API ${res.status}: ${(await res.text()).replace(/\s+/g, " ").slice(0, 300)}`)
  }
  const batches = await res.json()
  // searchStream renvoie un tableau de batches, chacun avec un tableau "results"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(batches) ? batches : []).flatMap((b: any) => b.results || [])
}

export interface GoogleCampaign {
  name: string
  status: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversions_value: number
  roas: number
  cpc: number
  ctr: number
}

export interface GoogleAdsResult {
  campaigns: GoogleCampaign[]
  summary: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    conversions_value: number
    roas: number
    cpc: number
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any): number => (v == null ? 0 : typeof v === "string" ? parseFloat(v) || 0 : v)
const r2 = (n: number) => Math.round(n * 100) / 100

// Sync des campagnes Google Ads pour une période GAQL (THIS_MONTH / LAST_MONTH).
// Renvoie le même format que l'ancienne version Python : { campaigns, summary }.
export async function getGoogleAdsCampaigns(
  period: "THIS_MONTH" | "LAST_MONTH" = "THIS_MONTH"
): Promise<GoogleAdsResult> {
  const rows = await search(`
    SELECT campaign.name, campaign.status,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value,
           metrics.average_cpc, metrics.ctr
    FROM campaign
    WHERE segments.date DURING ${period}
    ORDER BY metrics.cost_micros DESC
  `)

  const campaigns: GoogleCampaign[] = []
  const total = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0 }

  for (const row of rows) {
    const m = row.metrics || {}
    const spend = num(m.costMicros) / 1_000_000
    const clicks = num(m.clicks)
    if (spend === 0 && clicks === 0) continue // ignore les campagnes inactives
    const convValue = num(m.conversionsValue)
    const conversions = num(m.conversions)
    campaigns.push({
      name: row.campaign?.name || "—",
      status: row.campaign?.status || "",
      spend: r2(spend),
      impressions: num(m.impressions),
      clicks,
      conversions: Math.round(conversions * 10) / 10,
      conversions_value: r2(convValue),
      roas: spend > 0 ? Math.round((convValue / spend) * 10) / 10 : 0,
      cpc: num(m.averageCpc) ? r2(num(m.averageCpc) / 1_000_000) : 0,
      ctr: num(m.ctr) ? Math.round(num(m.ctr) * 10000) / 100 : 0,
    })
    total.spend += spend
    total.impressions += num(m.impressions)
    total.clicks += clicks
    total.conversions += conversions
    total.conversions_value += convValue
  }

  return {
    campaigns,
    summary: {
      spend: r2(total.spend),
      impressions: total.impressions,
      clicks: total.clicks,
      conversions: Math.round(total.conversions * 10) / 10,
      conversions_value: r2(total.conversions_value),
      roas: total.spend > 0 ? Math.round((total.conversions_value / total.spend) * 10) / 10 : 0,
      cpc: total.clicks > 0 ? r2(total.spend / total.clicks) : 0,
    },
  }
}
