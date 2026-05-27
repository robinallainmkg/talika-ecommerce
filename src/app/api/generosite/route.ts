import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─── Code classification rules ──────────────────────────────
type Category = "gifting" | "influence" | "welcome" | "logistique" | "service_client" | "offre_site" | "auto_discounts" | "autre"

const CODE_RULES: { pattern: RegExp; category: Category }[] = [
  // Gifting / MKG
  { pattern: /^MKG$/i, category: "gifting" },
  { pattern: /^ANNEG$/i, category: "gifting" },
  // Service client
  { pattern: /^CS/i, category: "service_client" },
  // Logistique
  { pattern: /^LA\s?POSTE$/i, category: "logistique" },
  { pattern: /^LA$/i, category: "logistique" },
  { pattern: /^LAPOSTE$/i, category: "logistique" },
  // Welcome / site generics
  { pattern: /^WELCOME/i, category: "welcome" },
  { pattern: /^VIP/i, category: "welcome" },
  { pattern: /^PLUS10$/i, category: "welcome" },
  { pattern: /^TALIKA\d/i, category: "welcome" },
  { pattern: /^SURPRISE/i, category: "offre_site" },
  { pattern: /^BONVOISIN$/i, category: "offre_site" },
  { pattern: /^SACHONS/i, category: "offre_site" },
]

function classifyCode(code: string, influencerCodes: Set<string>): Category {
  const upper = code.toUpperCase().trim()

  // Check influencer codes first
  if (influencerCodes.has(upper)) return "influence"

  // Check rules
  for (const rule of CODE_RULES) {
    if (rule.pattern.test(upper)) return rule.category
  }

  // Auto-generated Shopify codes (random strings)
  if (/^[A-Z0-9]{10,}$/.test(upper)) return "offre_site"

  return "autre"
}

const CATEGORY_LABELS: Record<Category, string> = {
  gifting: "Dotations (MKG)",
  influence: "Codes Influenceurs",
  welcome: "Codes Génériques (Welcome)",
  offre_site: "Offres Site (promos)",
  auto_discounts: "Remises automatiques (volume)",
  logistique: "Erreurs Logistiques (LA Poste)",
  service_client: "Retours / SAV (exclu)",
  autre: "Autres codes",
}

// Categories excluded from the generosity rate (SAV = not real generosity)
const EXCLUDED_CATEGORIES: Category[] = ["service_client"]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || "2026")
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1))

    // Fetch influencer codes
    const { data: infCodes } = await supabase
      .from("influencer_codes")
      .select("code")
      .eq("code_type", "influencer")
    const influencerCodeSet = new Set((infCodes || []).map(c => c.code.toUpperCase()))

    // Fetch orders from cache
    const { data: cacheEntry } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${year}_${month}`)
      .single()

    const orders = (cacheEntry?.data as any)?.orders || []

    if (orders.length === 0) {
      return NextResponse.json({ error: "No orders data. Run Shopify sync first.", categories: [] })
    }

    // Analyze each order's discounts
    const categoryTotals: Record<Category, { discount: number; orders: number; codes: Record<string, { discount: number; count: number }> }> = {
      gifting: { discount: 0, orders: 0, codes: {} },
      influence: { discount: 0, orders: 0, codes: {} },
      welcome: { discount: 0, orders: 0, codes: {} },
      offre_site: { discount: 0, orders: 0, codes: {} },
      auto_discounts: { discount: 0, orders: 0, codes: {} },
      logistique: { discount: 0, orders: 0, codes: {} },
      service_client: { discount: 0, orders: 0, codes: {} },
      autre: { discount: 0, orders: 0, codes: {} },
    }

    let totalRevenue = 0
    let totalDiscount = 0
    let ordersWithDiscount = 0
    let totalLineItemDiscounts = 0

    for (const order of orders) {
      const orderTotal = parseFloat(order.total_price || "0")
      const orderDiscount = parseFloat(order.total_discounts || "0")
      totalRevenue += orderTotal
      totalDiscount += orderDiscount

      // Check for line item compare_at_price discounts (prix barrés)
      for (const item of order.line_items || []) {
        const compareAt = parseFloat(item.compare_at_price || "0")
        const price = parseFloat(item.price || "0")
        if (compareAt > price && compareAt > 0) {
          const lineDiscount = (compareAt - price) * (item.quantity || 1)
          totalLineItemDiscounts += lineDiscount
        }
      }

      // Classify discount codes
      const discountCodes = order.discount_codes || []

      if (orderDiscount > 0) ordersWithDiscount++

      let codeAmountSum = 0
      for (const dc of discountCodes) {
        const code = (typeof dc === "string" ? dc : dc.code || "").toUpperCase().trim()
        const amount = parseFloat(typeof dc === "string" ? "0" : dc.amount || "0")
        if (!code) continue
        codeAmountSum += amount

        const category = classifyCode(code, influencerCodeSet)
        categoryTotals[category].discount += amount
        categoryTotals[category].orders += 1

        if (!categoryTotals[category].codes[code]) {
          categoryTotals[category].codes[code] = { discount: 0, count: 0 }
        }
        categoryTotals[category].codes[code].discount += amount
        categoryTotals[category].codes[code].count += 1
      }

      // Auto discounts = gap between total_discounts and code amounts
      // Catches volume discounts, auto promos applied alongside or without codes
      const autoGap = orderDiscount - codeAmountSum
      if (autoGap > 0) {
        categoryTotals.auto_discounts.discount += autoGap
        categoryTotals.auto_discounts.orders += 1
      }
    }

    // Build response — share = % de générosité spécifique par rapport au CA brut
    const caBrut = totalRevenue + totalDiscount + totalLineItemDiscounts
    const excludedDiscount = EXCLUDED_CATEGORIES.reduce((sum, cat) => sum + categoryTotals[cat].discount, 0)

    const categories = Object.entries(categoryTotals)
      .map(([key, val]) => ({
        id: key,
        label: CATEGORY_LABELS[key as Category],
        discount: Math.round(val.discount * 100) / 100,
        orders: val.orders,
        generosite_pct: caBrut > 0 ? Math.round((val.discount / caBrut) * 1000) / 10 : 0,
        excluded: EXCLUDED_CATEGORIES.includes(key as Category),
        codes: Object.entries(val.codes)
          .map(([code, data]) => ({ code, ...data }))
          .sort((a, b) => b.discount - a.discount),
      }))
      .sort((a, b) => b.discount - a.discount)

    // Generosity rate EXCLUDES retours/SAV (not real generosity)
    const generositeRate = caBrut > 0
      ? Math.round(((totalDiscount + totalLineItemDiscounts - excludedDiscount) / caBrut) * 1000) / 10
      : 0

    // ─── Shipping analysis (separate from générosité) ───
    let shippingPaid = 0
    let shippingFree = 0
    let ordersPaidShipping = 0
    let ordersFreeShipping = 0
    const shippingMethods: Record<string, { count: number; revenue: number }> = {}

    for (const order of orders) {
      const shippingLines = order.shipping_lines || []
      const discountApps = order.discount_applications || []

      // Check if this order has free shipping via automatic discount
      const hasFreeShippingDiscount = discountApps.some(
        (da: any) => da.target_type === "shipping_line"
      )

      let orderShipping = 0
      for (const sl of shippingLines) {
        const price = parseFloat(sl.price || "0")
        orderShipping += price
        const method = sl.title || "Inconnu"
        if (!shippingMethods[method]) shippingMethods[method] = { count: 0, revenue: 0 }
        shippingMethods[method].count++
        shippingMethods[method].revenue += price
      }

      if (hasFreeShippingDiscount || orderShipping === 0) {
        ordersFreeShipping++
        // Estimate the cost of free shipping (average paid shipping cost)
      } else {
        ordersPaidShipping++
        shippingPaid += orderShipping
      }
    }

    // Estimate lost shipping revenue = orders with free shipping × average shipping price
    const avgShippingPrice = ordersPaidShipping > 0 ? shippingPaid / ordersPaidShipping : 5
    shippingFree = ordersFreeShipping * avgShippingPrice

    const shippingBreakdown = Object.entries(shippingMethods)
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      period: `${year}-${String(month).padStart(2, "0")}`,
      total_orders: orders.length,
      orders_with_discount: ordersWithDiscount,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_discount_codes: Math.round(totalDiscount * 100) / 100,
      total_prix_barres: Math.round(totalLineItemDiscounts * 100) / 100,
      total_generosite: Math.round((totalDiscount + totalLineItemDiscounts) * 100) / 100,
      generosite_rate: generositeRate,
      categories,
      shipping: {
        orders_paid: ordersPaidShipping,
        orders_free: ordersFreeShipping,
        revenue_collected: Math.round(shippingPaid * 100) / 100,
        estimated_free_cost: Math.round(shippingFree * 100) / 100,
        avg_shipping_price: Math.round(avgShippingPrice * 100) / 100,
        free_shipping_rate: orders.length > 0 ? Math.round((ordersFreeShipping / orders.length) * 1000) / 10 : 0,
        methods: shippingBreakdown,
      },
    })
  } catch (error) {
    console.error("Generosite error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}
