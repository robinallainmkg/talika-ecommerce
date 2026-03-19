/**
 * Shopify Integration - Talika Cosmetics
 * Full access API connection
 */

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || ""
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ""

const shopifyFetch = async (endpoint: string, options?: RequestInit) => {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01${endpoint}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)
  return res.json()
}

export async function getOrders(params?: {
  status?: string
  created_at_min?: string
  created_at_max?: string
  limit?: number
}) {
  const query = new URLSearchParams()
  if (params?.status) query.set("status", params.status)
  if (params?.created_at_min) query.set("created_at_min", params.created_at_min)
  if (params?.created_at_max) query.set("created_at_max", params.created_at_max)
  query.set("limit", String(params?.limit || 50))

  return shopifyFetch(`/orders.json?${query}`)
}

export async function getProducts(limit = 50) {
  return shopifyFetch(`/products.json?limit=${limit}`)
}

export async function getOrdersByDiscountCode(code: string) {
  return shopifyFetch(`/orders.json?status=any&discount_codes=${code}`)
}

export async function getMonthlyRevenue(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0).toISOString()
  return getOrders({
    status: "any",
    created_at_min: startDate,
    created_at_max: endDate,
    limit: 250,
  })
}

export async function getCustomers(limit = 50) {
  return shopifyFetch(`/customers.json?limit=${limit}`)
}

export async function getDiscountCodes() {
  const priceRules = await shopifyFetch("/price_rules.json")
  const codes = []
  for (const rule of priceRules.price_rules || []) {
    const ruleDiscounts = await shopifyFetch(
      `/price_rules/${rule.id}/discount_codes.json`
    )
    codes.push(...(ruleDiscounts.discount_codes || []))
  }
  return codes
}
