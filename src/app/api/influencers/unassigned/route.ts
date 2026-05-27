import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // Fetch discount codes + orders in parallel
    const [discountRes, ordersRes] = await Promise.all([
      supabase
        .from("data_cache")
        .select("data")
        .eq("key", `shopify_discount_codes_${year}`)
        .single(),
      supabase
        .from("data_cache")
        .select("data")
        .eq("key", `shopify_orders_${year}_${month}`)
        .single(),
    ])

    const rawCodes = Array.isArray(discountRes.data?.data) ? discountRes.data.data : []
    const ordersData = ordersRes.data?.data as any
    const orders = Array.isArray(ordersData?.orders) ? ordersData.orders : []

    // Build stats per discount code from actual orders
    const codeStats: Record<string, { orders: number; revenue: number; discount: number }> = {}

    for (const order of orders) {
      if (order.cancelled_at) continue
      for (const dc of (order.discount_codes || [])) {
        const code = (dc.code || "").toUpperCase().trim()
        if (!code) continue
        if (!codeStats[code]) {
          codeStats[code] = { orders: 0, revenue: 0, discount: 0 }
        }
        codeStats[code].orders += 1
        codeStats[code].revenue += parseFloat(order.total_price || "0")
        codeStats[code].discount += parseFloat(dc.amount || "0")
      }
    }

    // Merge: all known Shopify codes + any code appearing in orders
    const allCodes = new Set<string>()
    for (const c of rawCodes) {
      allCodes.add((c.code || "").toUpperCase().trim())
    }
    for (const code of Object.keys(codeStats)) {
      allCodes.add(code)
    }

    const codes = Array.from(allCodes).map((code) => ({
      code,
      orders: codeStats[code]?.orders || 0,
      revenue: codeStats[code]?.revenue || 0,
      discount: codeStats[code]?.discount || 0,
    }))

    // Sort by revenue descending
    codes.sort((a, b) => b.revenue - a.revenue)

    return NextResponse.json({ codes })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
