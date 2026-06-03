import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadCodeCategoryMap, computeGenerosite, PromoPeriod } from "@/lib/generosite"
import { normalizeCode, CODE_TYPE_LABELS, GENEROSITE_EXCLUDED_TYPES } from "@/lib/codes"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || "2026")
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1))

    const categoryMap = await loadCodeCategoryMap()

    // Load promo periods from calendar_events (type = promo)
    const { data: promoEvents } = await supabase
      .from("calendar_events")
      .select("scheduled_at, metadata")
      .eq("event_type", "promo")
    const promoPeriods: PromoPeriod[] = (promoEvents || []).map((e: any) => ({
      start: (e.scheduled_at || "").slice(0, 10),
      end: (e.metadata?.end_date || e.scheduled_at || "").slice(0, 10),
    }))

    const { data: cacheEntry } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${year}_${month}`)
      .single()

    const orders = (cacheEntry?.data as any)?.orders || []

    if (orders.length === 0) {
      return NextResponse.json({ error: "No orders data. Run Shopify sync first.", categories: [] })
    }

    const result = computeGenerosite(orders, categoryMap, promoPeriods)

    // Build detailed per-code breakdown for the UI
    const codeDetails: Record<string, { discount: number; orders: number; codes: Record<string, { discount: number; count: number }> }> = {}
    const categorize = (code: string) => categoryMap.get(normalizeCode(code)) || "autre"
    let ordersWithDiscount = 0

    for (const o of orders) {
      if (o.financial_status === "voided" || o.cancelled_at) continue
      const orderDiscount = parseFloat(o.total_discounts || "0")
      if (orderDiscount > 0) ordersWithDiscount++

      let codeSum = 0
      for (const dc of o.discount_codes || []) {
        const code = typeof dc === "string" ? dc : dc.code || ""
        const amount = parseFloat(typeof dc === "string" ? "0" : dc.amount || "0")
        if (!code) continue
        codeSum += amount
        const cat = categorize(code)
        if (!codeDetails[cat]) codeDetails[cat] = { discount: 0, orders: 0, codes: {} }
        codeDetails[cat].discount += amount
        codeDetails[cat].orders += 1
        const norm = normalizeCode(code)
        if (!codeDetails[cat].codes[norm]) codeDetails[cat].codes[norm] = { discount: 0, count: 0 }
        codeDetails[cat].codes[norm].discount += amount
        codeDetails[cat].codes[norm].count += 1
      }
      const autoGap = orderDiscount - codeSum
      if (autoGap > 0) {
        const orderDate = (o.created_at || "").slice(0, 10)
        const matchedPromo = promoPeriods.find(p => orderDate >= p.start && orderDate <= p.end)
        const autoCat = matchedPromo ? "offre_site" : "auto_discounts"
        if (!codeDetails[autoCat]) codeDetails[autoCat] = { discount: 0, orders: 0, codes: {} }
        codeDetails[autoCat].discount += autoGap
        codeDetails[autoCat].orders += 1
        // Track auto discounts as pseudo-codes so they show in the dropdown
        const autoLabel = matchedPromo ? `[PROMO AUTO] ${matchedPromo.start}→${matchedPromo.end}` : "[REMISE VOLUME]"
        if (!codeDetails[autoCat].codes[autoLabel]) codeDetails[autoCat].codes[autoLabel] = { discount: 0, count: 0 }
        codeDetails[autoCat].codes[autoLabel].discount += autoGap
        codeDetails[autoCat].codes[autoLabel].count += 1
      }
    }

    const categories = Object.entries(codeDetails)
      .map(([key, val]) => ({
        id: key,
        label: CODE_TYPE_LABELS[key] || key,
        discount: Math.round(val.discount * 100) / 100,
        orders: val.orders,
        generosite_pct: result.ca_brut > 0 ? Math.round((val.discount / result.ca_brut) * 1000) / 10 : 0,
        excluded: (GENEROSITE_EXCLUDED_TYPES as readonly string[]).includes(key),
        codes: Object.entries(val.codes)
          .map(([code, data]) => ({ code, ...data }))
          .sort((a, b) => b.discount - a.discount),
      }))
      .sort((a, b) => b.discount - a.discount)

    // Shipping analysis (separate from generosity)
    let shippingPaid = 0
    let ordersPaidShipping = 0
    let ordersFreeShipping = 0
    const shippingMethods: Record<string, { count: number; revenue: number }> = {}

    for (const order of orders) {
      if (order.financial_status === "voided" || order.cancelled_at) continue
      const shippingLines = order.shipping_lines || []
      const discountApps = order.discount_applications || []
      const hasFreeShippingDiscount = discountApps.some((da: any) => da.target_type === "shipping_line")

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
      } else {
        ordersPaidShipping++
        shippingPaid += orderShipping
      }
    }

    const avgShippingPrice = ordersPaidShipping > 0 ? shippingPaid / ordersPaidShipping : 5
    const shippingBreakdown = Object.entries(shippingMethods)
      .map(([method, data]) => ({ method, ...data }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      period: `${year}-${String(month).padStart(2, "0")}`,
      total_orders: result.total_orders,
      orders_with_discount: ordersWithDiscount,
      total_revenue: result.total_revenue,
      total_discount_codes: result.total_discount,
      total_prix_barres: result.prix_barres,
      total_generosite: result.total_discount + result.prix_barres,
      generosite_rate: result.generosite_rate,
      ca_brut: result.ca_brut,
      categories,
      shipping: {
        orders_paid: ordersPaidShipping,
        orders_free: ordersFreeShipping,
        revenue_collected: Math.round(shippingPaid * 100) / 100,
        estimated_free_cost: Math.round(ordersFreeShipping * avgShippingPrice * 100) / 100,
        avg_shipping_price: Math.round(avgShippingPrice * 100) / 100,
        free_shipping_rate: result.total_orders > 0 ? Math.round((ordersFreeShipping / result.total_orders) * 1000) / 10 : 0,
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
