/**
 * Shopify Integration - Talika Cosmetics
 * Full access API connection with proper pagination
 */

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || ""
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || ""
const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/2024-01`

async function shopifyFetch(endpoint: string, options?: RequestInit) {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`
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

/** Same as shopifyFetch but also returns the Link header for pagination */
async function shopifyFetchWithHeaders(endpoint: string) {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`)
  const data = await res.json()
  const linkHeader = res.headers.get("link") || ""
  return { data, linkHeader }
}

/** Extract the "next" page URL from the Shopify Link header */
function getNextPageUrl(linkHeader: string): string | null {
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
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

export async function getProducts(limit = 250) {
  return shopifyFetch(`/products.json?limit=${limit}`)
}

export async function getVariantPriceMap(): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  let nextUrl: string | null = `/products.json?limit=250&fields=id,variants`
  let page = 0
  while (nextUrl && page < 20) {
    const { data, linkHeader } = await shopifyFetchWithHeaders(nextUrl)
    for (const p of data.products || []) {
      for (const v of p.variants || []) {
        if (v.compare_at_price) map.set(v.id, v.compare_at_price)
      }
    }
    page++
    if ((data.products || []).length < 250) break
    nextUrl = getNextPageUrl(linkHeader)
  }
  return map
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

/**
 * Get aggregated analytics / KPIs for a date range
 * Fetches ALL orders (paginated) to compute accurate totals
 */
export async function getAnalytics(params?: {
  created_at_min?: string
  created_at_max?: string
}) {
  const orders = await getAllOrders(params)

  const total_revenue = orders.reduce(
    (sum: number, o: any) => sum + parseFloat(o.total_price || "0"),
    0
  )
  const total_refunds = orders.reduce((sum: number, o: any) => {
    const refunds = o.refunds || []
    return (
      sum +
      refunds.reduce(
        (rs: number, r: any) =>
          rs +
          (r.transactions || []).reduce(
            (ts: number, t: any) => ts + parseFloat(t.amount || "0"),
            0
          ),
        0
      )
    )
  }, 0)

  const uniqueCustomers = new Set(
    orders.map((o: any) => o.customer?.id).filter(Boolean)
  )

  const total_discount = orders.reduce(
    (sum: number, o: any) => sum + parseFloat(o.total_discounts || "0"),
    0
  )

  return {
    total_revenue,
    total_refunds,
    total_orders: orders.length,
    aov: orders.length > 0 ? total_revenue / orders.length : 0,
    unique_customers: uniqueCustomers.size,
    total_discount,
    generosity: total_revenue > 0 ? (total_discount / total_revenue) * 100 : 0,
  }
}

/**
 * Fetch ALL orders with Shopify REST pagination (Link header rel="next").
 * Handles up to 10,000 orders per call (40 pages × 250).
 */
export async function getAllOrders(params?: {
  created_at_min?: string
  created_at_max?: string
}) {
  const allOrders: any[] = []
  const MAX_PAGES = 40 // Safety limit

  const query = new URLSearchParams()
  query.set("status", "any")
  query.set("limit", "250")
  if (params?.created_at_min) query.set("created_at_min", params.created_at_min)
  if (params?.created_at_max) query.set("created_at_max", params.created_at_max)

  let nextUrl: string | null = `/orders.json?${query}`
  let page = 0

  while (nextUrl && page < MAX_PAGES) {
    const { data, linkHeader } = await shopifyFetchWithHeaders(nextUrl)
    const orders = data.orders || []
    allOrders.push(...orders)
    page++

    console.log(`[Shopify] Page ${page}: ${orders.length} orders (total: ${allOrders.length})`)

    if (orders.length < 250) break // Last page
    nextUrl = getNextPageUrl(linkHeader)
  }

  console.log(`[Shopify] Fetched ${allOrders.length} orders in ${page} page(s)`)
  return allOrders
}
