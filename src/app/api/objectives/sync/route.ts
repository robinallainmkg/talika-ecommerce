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
    // Tracks revenue, ca_brut, and generosity breakdown by category
    const aggregateByMonth = (orders: any[]) => {
      const months: Record<number, {
        revenue: number        // total_price - refunds (for CA column)
        ca_brut: number        // catalog price = sum of max(compare_at_price, price) * qty
        discounts: number      // order.total_discounts (codes + auto)
        prix_barres: number    // sum of (compare_at_price - price) * qty per line item
        orders: number
        // Breakdown by category for insights tooltip
        dotations: number      // MKG code (influencer gifts at 100%)
        retours: number        // CS-Retour code (returns/exchanges)
        codes_influenceurs: number // influencer codes (ending in 10/12/15/20%)
        codes_promo: number    // other promo codes
        auto_discounts: number // orders with discounts but no code
      }> = {}
      for (let m = 1; m <= 12; m++) {
        months[m] = {
          revenue: 0, ca_brut: 0, discounts: 0, prix_barres: 0, orders: 0,
          dotations: 0, retours: 0, codes_influenceurs: 0, codes_promo: 0, auto_discounts: 0,
        }
      }
      for (const o of orders) {
        if (o.financial_status === "voided" || o.cancelled_at) continue
        const month = new Date(o.created_at).getMonth() + 1
        const totalPrice = parseFloat(o.total_price || "0")
        const refundAmount = (o.refunds || []).reduce((sum: number, r: any) =>
          sum + (r.transactions || []).reduce((ts: number, t: any) =>
            ts + parseFloat(t.amount || "0"), 0), 0)

        months[month].revenue += totalPrice - refundAmount
        const orderDiscount = parseFloat(o.total_discounts || "0")
        months[month].discounts += orderDiscount

        // Categorize discount by code type
        const codes = o.discount_codes || []
        if (codes.length === 0 && orderDiscount > 0) {
          // No code = automatic discount (volume, etc.)
          months[month].auto_discounts += orderDiscount
        } else {
          for (const dc of codes) {
            const code = (dc.code || "").toUpperCase()
            const amount = parseFloat(dc.amount || "0")
            if (code === "MKG") {
              months[month].dotations += amount
            } else if (code.startsWith("CS-") || code.includes("RETOUR") || code.includes("RETURN")) {
              months[month].retours += amount
            } else {
              // Check if influencer code (name + percentage pattern)
              const isInfluencer = /^[A-Z]+\d{1,2}$/.test(code) || /^[A-Z]+-?\d{1,2}$/.test(code)
              if (isInfluencer) {
                months[month].codes_influenceurs += amount
              } else {
                months[month].codes_promo += amount
              }
            }
          }
        }

        // Prix barrés from line items
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

    // Compute generosity + breakdown per month
    // ca_2025, ca_2026, media_spent are manually entered from Reporting Global
    // and must NEVER be overwritten by this sync.
    const generositeByMonth: Record<number, { pct: number; detail: object }> = {}
    for (let m = 1; m <= 12; m++) {
      const a = agg2026[m]
      const totalGenerosite = a.discounts + a.prix_barres
      const pct = a.ca_brut > 0
        ? Math.round((totalGenerosite / a.ca_brut) * 10000) / 100
        : 0
      // Breakdown for tooltip insights
      const detail = a.ca_brut > 0 ? {
        ca_brut: Math.round(a.ca_brut),
        dotations: Math.round(a.dotations),
        retours: Math.round(a.retours),
        codes_influenceurs: Math.round(a.codes_influenceurs),
        codes_promo: Math.round(a.codes_promo),
        auto_discounts: Math.round(a.auto_discounts),
        prix_barres: Math.round(a.prix_barres),
        total: Math.round(totalGenerosite),
      } : {}
      generositeByMonth[m] = { pct, detail }
    }

    // Update generosite + generosite_detail — preserve ca_2025, ca_2026, media_spent
    const updateErrors: string[] = []
    for (let m = 1; m <= 12; m++) {
      const { error: updateErr } = await supabase
        .from("objectives_2026")
        .update({
          generosite: generositeByMonth[m].pct,
          generosite_detail: generositeByMonth[m].detail,
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
