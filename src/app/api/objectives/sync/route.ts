import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAllOrders } from "@/lib/integrations/shopify"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    // Fetch all 2025 orders in one paginated call
    const orders2025 = await getAllOrders({
      created_at_min: "2025-01-01T00:00:00Z",
      created_at_max: "2025-12-31T23:59:59Z",
    })

    // Fetch 2026 orders up to now
    const orders2026 = await getAllOrders({
      created_at_min: "2026-01-01T00:00:00Z",
      created_at_max: now.toISOString(),
    })

    // Aggregate by month
    function aggregateByMonth(orders: any[]) {
      const months: Record<number, { revenue: number; discounts: number; orders: number }> = {}
      for (let m = 1; m <= 12; m++) {
        months[m] = { revenue: 0, discounts: 0, orders: 0 }
      }
      for (const o of orders) {
        if (o.financial_status === "voided" || o.cancelled_at) continue
        const month = new Date(o.created_at).getMonth() + 1
        const revenue = parseFloat(o.total_price || "0")
        const refundAmount = (o.refunds || []).reduce((sum: number, r: any) =>
          sum + (r.transactions || []).reduce((ts: number, t: any) =>
            ts + parseFloat(t.amount || "0"), 0), 0)
        months[month].revenue += revenue - refundAmount
        months[month].discounts += parseFloat(o.total_discounts || "0")
        months[month].orders += 1
      }
      return months
    }

    const agg2025 = aggregateByMonth(orders2025)
    const agg2026 = aggregateByMonth(orders2026)

    // Fetch existing rows to preserve media_spent
    const { data: existing } = await supabase
      .from("objectives_2026")
      .select("month, media_spent")
      .order("month")

    const existingMap = new Map(
      (existing || []).map((r: any) => [r.month, r.media_spent || 0])
    )

    // Build upsert rows (preserve media_spent from existing data)
    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const ca2025 = Math.round(agg2025[m].revenue)
      const ca2026 = m <= currentMonth ? Math.round(agg2026[m].revenue) : 0
      const generosite2026 = agg2026[m].revenue > 0
        ? Math.round((agg2026[m].discounts / agg2026[m].revenue) * 10000) / 100
        : 0

      return {
        month: m,
        ca_2025: ca2025,
        ca_2026: ca2026,
        media_spent: existingMap.get(m) || 0,
        generosite: generosite2026,
        updated_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from("objectives_2026")
      .upsert(rows, { onConflict: "month" })

    if (error) {
      console.error("Upsert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      orders_2025: orders2025.length,
      orders_2026: orders2026.length,
      rows,
    })
  } catch (error) {
    console.error("Objectives sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}
