/**
 * Meta (Facebook) Ads API Integration
 */

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || ""
// Strip act_ prefix if present — the code already prepends it
const RAW_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || ""
const META_AD_ACCOUNT_ID = RAW_AD_ACCOUNT_ID.replace(/^act_/, "")
const META_API_VERSION = "v21.0"

const metaFetch = async (endpoint: string, params?: Record<string, string>) => {
  const query = new URLSearchParams({
    access_token: META_ACCESS_TOKEN,
    ...params,
  })
  const url = `https://graph.facebook.com/${META_API_VERSION}${endpoint}?${query}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API error: ${res.status}`)
  return res.json()
}

export async function getCampaigns() {
  return metaFetch(`/act_${META_AD_ACCOUNT_ID}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
  })
}

export async function getCampaignInsights(
  campaignId: string,
  dateRange?: { since: string; until: string }
) {
  const params: Record<string, string> = {
    fields:
      "impressions,clicks,ctr,cpc,spend,conversions,actions,cost_per_action_type",
  }
  if (dateRange) {
    params.time_range = JSON.stringify(dateRange)
  }
  return metaFetch(`/${campaignId}/insights`, params)
}

export async function getAdSets(campaignId: string) {
  return metaFetch(`/${campaignId}/adsets`, {
    fields: "id,name,status,targeting,bid_amount,daily_budget",
  })
}

export async function getAds(adSetId: string) {
  return metaFetch(`/${adSetId}/ads`, {
    fields: "id,name,status,creative",
  })
}

export async function getAccountInsights(
  dateRange?: { since: string; until: string }
) {
  const params: Record<string, string> = {
    fields:
      "impressions,clicks,ctr,cpc,spend,conversions,actions,cost_per_action_type,purchase_roas",
    level: "account",
  }
  if (dateRange) {
    params.time_range = JSON.stringify(dateRange)
  }
  return metaFetch(`/act_${META_AD_ACCOUNT_ID}/insights`, params)
}
