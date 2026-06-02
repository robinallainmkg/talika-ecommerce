import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export async function GET() {
  try {
    const supabase = createServiceClient()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const { data: cacheData } = await supabase
      .from("data_cache")
      .select("key, data")
      .eq("source", "shopify")
      .in("key", [
        `shopify_analytics_${year}_${month}`,
        `shopify_orders_${year}_${month}`,
      ])

    const cacheMap = new Map((cacheData || []).map((e: any) => [e.key, e.data]))
    const analytics = cacheMap.get(`shopify_analytics_${year}_${month}`) || null
    const ordersData = cacheMap.get(`shopify_orders_${year}_${month}`) as any
    const orders = ordersData?.orders || []

    let chartData: any[] = []
    let topProducts: any[] = []
    let discountBreakdown: any[] = []

    if (orders.length > 0) {
      const dailyMap: Record<string, { date: string; revenue: number; orders: number }> = {}
      for (const o of orders) {
        const day = o.created_at?.split("T")[0]
        if (!day) continue
        if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, orders: 0 }
        dailyMap[day].revenue += parseFloat(o.total_price || "0")
        dailyMap[day].orders += 1
      }
      chartData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

      const productMap: Record<string, any> = {}
      for (const o of orders) {
        for (const item of o.line_items || []) {
          const title = item.title || "Inconnu"
          if (!productMap[title]) productMap[title] = { title, quantity: 0, revenue: 0, orders: 0 }
          productMap[title].quantity += item.quantity || 1
          productMap[title].revenue += parseFloat(item.price || "0") * (item.quantity || 1)
          productMap[title].orders += 1
        }
      }
      topProducts = Object.values(productMap).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 15)

      const codeMap: Record<string, any> = {}
      for (const o of orders) {
        for (const dc of o.discount_codes || []) {
          const code = dc.code || "?"
          if (!codeMap[code]) codeMap[code] = { code, orders: 0, revenue: 0, discount: 0 }
          codeMap[code].orders += 1
          codeMap[code].revenue += parseFloat(o.total_price || "0")
          codeMap[code].discount += parseFloat(dc.amount || "0")
        }
      }
      discountBreakdown = Object.values(codeMap).sort((a: any, b: any) => b.orders - a.orders).slice(0, 15)
    }

    return NextResponse.json({
      year,
      month,
      analytics,
      chartData,
      topProducts,
      discountBreakdown,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
