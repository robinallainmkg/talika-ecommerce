import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Returns lightweight dashboard stats (KPIs + daily chart)
// Avoids sending the full 5MB orders blob to the browser
export async function GET() {
  try {
    const now = new Date()
    const monthKey = `${now.getFullYear()}_${now.getMonth() + 1}`

    // 1. Fetch analytics KPIs (tiny: 244 bytes)
    const { data: analyticsRow } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_analytics_${monthKey}`)
      .single()

    const analytics = analyticsRow?.data || null

    // 2. Build daily chart data server-side from orders (aggregated, not raw)
    const { data: ordersRow } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${monthKey}`)
      .single()

    const dailyChart: { date: string; revenue: number; orders: number }[] = []

    if (ordersRow?.data) {
      const orders = (ordersRow.data as any)?.orders || []
      const dailyMap = new Map<string, { revenue: number; orders: number }>()

      for (const order of orders) {
        const day = (order.created_at || "").split("T")[0]
        if (!day) continue
        const price = parseFloat(order.total_price || "0")
        const existing = dailyMap.get(day)
        if (existing) {
          existing.revenue += price
          existing.orders += 1
        } else {
          dailyMap.set(day, { revenue: price, orders: 1 })
        }
      }

      for (const [date, data] of Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        dailyChart.push({
          date,
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.orders,
        })
      }
    }

    return NextResponse.json({
      analytics,
      dailyChart,
      cachedAt: analyticsRow ? new Date().toISOString() : null,
    })
  } catch (error) {
    console.error("Dashboard stats error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stats" },
      { status: 500 }
    )
  }
}
