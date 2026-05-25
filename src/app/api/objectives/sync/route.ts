/**
 * POST /api/objectives/sync
 *
 * Syncs Shopify order data into the objectives_2026 table.
 * Called via the "Sync Shopify" button on the Objectives page.
 *
 * == DATA SOURCES & WHAT THIS ENDPOINT UPDATES ==
 *
 * This endpoint ONLY updates the `generosite` column (Shopify discount rate).
 *
 * It PRESERVES (does not overwrite):
 *   - ca_2025: manually entered from Reporting Global Excel (Shopify + Amazon + Choose)
 *   - ca_2026: manually entered from Reporting Global Excel (Shopify + Amazon + Choose)
 *   - media_spent: manually entered from Reporting Global Excel (ads only)
 *
 * == IMPORTANT: CA VALUES ==
 *
 * ca_2025 and ca_2026 are entered manually from Reporting Global Excel
 * (Shopify + Amazon + Choose). This sync does NOT touch them.
 * The Shopify-only revenue is computed internally for the aggregation
 * but only used to return informational shopify_ca values in the response.
 *
 * == GENEROSITY FORMULA ==
 *
 * generosite = (discount_codes + prix_barres) / ca_brut * 100
 *
 * Where:
 *   - discount_codes = sum of Shopify order.total_discounts (codes + automatic discounts)
 *   - prix_barres = sum of (compare_at_price - price) * qty per line item
 *   - ca_brut = sum of max(compare_at_price, price) * qty (catalog/original price)
 *
 * This matches the formula in /api/generosite/products (the generosite page).
 * Generosity is Shopify-only by design (Amazon/Choose have different promo mechanics).
 *
 * WARNING: Do NOT use total_price or (total_price - refunds) as denominator.
 * total_price is already net of both discounts AND prix barrés — using it
 * as denominator inflates the %. Use ca_brut (original catalog price) instead.
 *
 * == WHAT COUNTS AS GENEROSITY ==
 *
 * Shopify total_discounts captures ALL of these:
 *   1. Product discount codes (influencer codes at 10-12%, promo codes)
 *   2. Order discount codes (cart-level promos)
 *   3. Shipping discount codes (free shipping offers)
 *   4. Dotations (influencer gifts) — passed as orders with code "MKG" at 100% discount
 *   5. Automatic discounts (volume discounts, etc.)
 *
 * NOT in total_discounts but calculated separately from line items:
 *   - Prix barrés (compare_at_price - price) — now included in generosity calc
 *
 * SHOULD NOT count as generosity but currently does:
 *   - Returns/exchanges — free replacement orders where original was already paid.
 *     These inflate generosity because the discount is counted but the original
 *     payment is on a different order. TODO: exclude by discount code if identifiable.
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
    // Tracks revenue (net refunds), ca_brut (catalog price), discounts, and prix_barres
    const aggregateByMonth = (orders: any[]) => {
      const months: Record<number, {
        revenue: number       // total_price - refunds (for CA column)
        ca_brut: number       // catalog price = sum of max(compare_at_price, price) * qty
        discounts: number     // order.total_discounts (codes + auto)
        prix_barres: number   // sum of (compare_at_price - price) * qty per line item
        orders: number
      }> = {}
      for (let m = 1; m <= 12; m++) {
        months[m] = { revenue: 0, ca_brut: 0, discounts: 0, prix_barres: 0, orders: 0 }
      }
      for (const o of orders) {
        if (o.financial_status === "voided" || o.cancelled_at) continue
        const month = new Date(o.created_at).getMonth() + 1
        const totalPrice = parseFloat(o.total_price || "0")
        const refundAmount = (o.refunds || []).reduce((sum: number, r: any) =>
          sum + (r.transactions || []).reduce((ts: number, t: any) =>
            ts + parseFloat(t.amount || "0"), 0), 0)

        // Revenue for CA column (net of refunds)
        months[month].revenue += totalPrice - refundAmount

        // Discount codes + automatic discounts (order-level)
        months[month].discounts += parseFloat(o.total_discounts || "0")

        // Prix barrés: delta between compare_at_price and price per line item
        // This is NOT included in total_discounts — must be calculated separately
        let orderCaBrut = 0
        let orderPrixBarres = 0
        for (const item of (o.line_items || [])) {
          const price = parseFloat(item.price || "0")
          const compareAt = parseFloat(item.compare_at_price || "0")
          const qty = item.quantity || 1
          const catalogPrice = (compareAt > 0 && compareAt > price) ? compareAt : price
          orderCaBrut += catalogPrice * qty
          if (compareAt > price && compareAt > 0) {
            orderPrixBarres += (compareAt - price) * qty
          }
        }
        months[month].ca_brut += orderCaBrut
        months[month].prix_barres += orderPrixBarres
        months[month].orders += 1
      }
      return months
    }

    const agg2025 = aggregateByMonth(orders2025)
    const agg2026 = aggregateByMonth(orders2026)

    // Compute generosity per month (only thing the sync updates)
    // ca_2025, ca_2026, media_spent are manually entered from Reporting Global
    // and must NEVER be overwritten by this sync.
    const generositeByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) {
      const totalGenerosite = agg2026[m].discounts + agg2026[m].prix_barres
      generositeByMonth[m] = agg2026[m].ca_brut > 0
        ? Math.round((totalGenerosite / agg2026[m].ca_brut) * 10000) / 100
        : 0
    }

    // Update ONLY generosite column — preserve ca_2025, ca_2026, media_spent
    const updateErrors: string[] = []
    for (let m = 1; m <= 12; m++) {
      const { error: updateErr } = await supabase
        .from("objectives_2026")
        .update({
          generosite: generositeByMonth[m],
          updated_at: new Date().toISOString(),
        })
        .eq("month", m)

      if (updateErr) {
        updateErrors.push(`Month ${m}: ${updateErr.message}`)
      }
    }

    if (updateErrors.length > 0) {
      console.error("Update errors:", updateErrors)
      return NextResponse.json({ error: updateErrors.join("; ") }, { status: 500 })
    }

    // Build response summary (read-only, for display)
    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      return {
        month: m,
        generosite: generositeByMonth[m],
        shopify_ca_2025: Math.round(agg2025[m].revenue),
        shopify_ca_2026: m <= currentMonth ? Math.round(agg2026[m].revenue) : 0,
      }
    })

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      orders_2025: orders2025.length,
      orders_2026: orders2026.length,
      updated_fields: ["generosite"],
      preserved_fields: ["ca_2025", "ca_2026", "media_spent"],
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
