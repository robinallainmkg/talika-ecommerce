/**
 * POST /api/objectives/sync
 *
 * Syncs Shopify order data into the objectives_2026 table.
 * Called via the "Sync Shopify" button on the Objectives page.
 *
 * == DATA SOURCES & WHAT THIS ENDPOINT UPDATES ==
 *
 * This endpoint ONLY updates columns that come from Shopify:
 *   - ca_2025: Shopify revenue by month (total_price - refunds), used as comparison baseline
 *   - ca_2026: Shopify revenue by month (total_price - refunds)
 *   - generosite: Shopify discount rate (see formula below)
 *
 * It PRESERVES (does not overwrite):
 *   - media_spent: manually entered or imported from Reporting Global Excel
 *
 * == IMPORTANT: CA VALUES ==
 *
 * ca_2025 and ca_2026 are Shopify-only revenue. The official reporting
 * (Reporting Global.xlsx on SharePoint) includes Shopify + Amazon + Choose.
 * If reporting values have been manually inserted via SQL, a Sync Shopify
 * will OVERWRITE them with Shopify-only data. To use reporting values,
 * insert them via SQL after syncing, or don't sync at all.
 *
 * == GENEROSITY FORMULA ==
 *
 * generosite = total_discounts / gross_revenue * 100
 *
 * Where:
 *   - total_discounts = sum of Shopify order.total_discounts (codes + automatic discounts)
 *   - gross_revenue = sum of Shopify order.total_price (BEFORE refund subtraction)
 *
 * This matches the formula in getAnalytics() in lib/integrations/shopify.ts.
 * Generosity is Shopify-only by design (Amazon/Choose have different promo mechanics).
 *
 * WARNING: Do NOT use (revenue - refunds) as denominator — that inflates the %
 * because refunds reduce the base while discounts stay counted.
 *
 * == KPI TARGETS (defined in page.tsx) ==
 *
 *   - Croissance CA: +20% vs 2025 (GROWTH_TARGET = 1.20)
 *   - Media/CA: <= 25%
 *   - Generosite: 20% (down from 23.75% in 2025)
 *
 * == EXCLUDED ORDERS ==
 *
 * Orders with financial_status === "voided" or cancelled_at set are skipped.
 */

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
    const aggregateByMonth = (orders: any[]) => {
      const months: Record<number, { revenue: number; gross_revenue: number; discounts: number; orders: number }> = {}
      for (let m = 1; m <= 12; m++) {
        months[m] = { revenue: 0, gross_revenue: 0, discounts: 0, orders: 0 }
      }
      for (const o of orders) {
        if (o.financial_status === "voided" || o.cancelled_at) continue
        const month = new Date(o.created_at).getMonth() + 1
        const totalPrice = parseFloat(o.total_price || "0")
        const refundAmount = (o.refunds || []).reduce((sum: number, r: any) =>
          sum + (r.transactions || []).reduce((ts: number, t: any) =>
            ts + parseFloat(t.amount || "0"), 0), 0)
        months[month].revenue += totalPrice - refundAmount
        months[month].gross_revenue += totalPrice // before refunds, for generosity calc
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
      // Generosity = discounts / gross_revenue (total_price before refunds)
      // Same formula as getAnalytics: discount / total_revenue
      const generosite2026 = agg2026[m].gross_revenue > 0
        ? Math.round((agg2026[m].discounts / agg2026[m].gross_revenue) * 10000) / 100
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
