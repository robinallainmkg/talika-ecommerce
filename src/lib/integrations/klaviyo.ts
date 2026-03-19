/**
 * Klaviyo API Integration
 */

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY || ""
const KLAVIYO_BASE = "https://a.klaviyo.com/api"

const klaviyoFetch = async (endpoint: string, options?: RequestInit) => {
  const res = await fetch(`${KLAVIYO_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      "Content-Type": "application/json",
      revision: "2024-02-15",
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`Klaviyo API error: ${res.status}`)
  return res.json()
}

export async function getFlows() {
  return klaviyoFetch("/flows/")
}

export async function getFlowMessages(flowId: string) {
  return klaviyoFetch(`/flows/${flowId}/flow-messages/`)
}

export async function getCampaigns() {
  return klaviyoFetch("/campaigns/")
}

export async function getCampaignMessages(campaignId: string) {
  return klaviyoFetch(`/campaigns/${campaignId}/campaign-messages/`)
}

export async function getMetrics() {
  return klaviyoFetch("/metrics/")
}

export async function getMetricAggregates(metricId: string, params: {
  measurement: string
  interval: string
  filter: string
}) {
  return klaviyoFetch("/metric-aggregates/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          ...params,
        },
      },
    }),
  })
}

export async function getLists() {
  return klaviyoFetch("/lists/")
}

export async function getProfiles(filter?: string) {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : ""
  return klaviyoFetch(`/profiles/${query}`)
}
