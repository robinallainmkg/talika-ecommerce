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

// Shape of aggregated data per month (cached + fresh)
interface MonthAgg {
  revenue: number
  ca_brut: number
  discounts: number
  prix_barres: number
  orders: number
  dotations: number
  retours: number
  codes_influenceurs: number
  codes_promo: number
  auto_discounts: number
}

const emptyAgg = (): MonthAgg => ({
  revenue: 0, ca_brut: 0, discounts: 0, prix_barres: 0, orders: 0,
  dotations: 0, retours: 0, codes_influenceurs: 0, codes_promo: 0, auto_discounts: 0,
})

// Aggregate orders into a single MonthAgg
const aggregateOrders = (orders: any[]): MonthAgg => {
  const agg = emptyAgg()
  for (const o of orders) {
    if (o.financial_status === "voided" || o.cancelled_at) continue
    const totalPrice = parseFloat(o.total_price || "0")
    const refundAmount = (o.refunds || []).reduce((sum: number, r: any) =>
      sum + (r.transactions || []).reduce((ts: number, t: any) =>
        ts + parseFloat(t.amount || "0"), 0), 0)

    agg.revenue += totalPrice - refundAmount
    const orderDiscount = parseFloat(o.total_discounts || "0")
    agg.discounts += orderDiscount

    // Categorize by code type
    const codes = o.discount_codes || []
    let codeAmountSum = 0
    for (const dc of codes) {
      const code = (dc.code || "").toUpperCase()
      const amount = parseFloat(dc.amount || "0")
      codeAmountSum += amount
      if (code === "MKG") {
        agg.dotations += amount
      } else if (code.startsWith("CS-") || code.includes("RETOUR") || code.includes("RETURN")) {
        agg.retours += amount
      } else {
        const isInfluencer = /^[A-Z]+\d{1,2}$/.test(code) || /^[A-Z]+-?\d{1,2}$/.test(code)
        if (isInfluencer) {
          agg.codes_influenceurs += amount
        } else {
          agg.codes_promo += amount
        }
      }
    }
    // Auto discounts = gap between total_discounts and code amounts
    const autoGap = orderDiscount - codeAmountSum
    if (autoGap > 0) agg.auto_discounts += autoGap

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
    agg.ca_brut += orderCaBrut
    agg.prix_barres += orderPrixBarres
    agg.orders += 1
  }
  return agg
}

export async function POST() {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // 1-12

    // == CACHING STRATEGY ==
    // Months < currentMonth - 1 are "closed" — orders won't change.
    // We cache their aggregation in data_cache and skip Shopify fetch.
    // Only re-fetch: current month + previous month (for late orders/refunds).
    const freshMonths = [currentMonth, Math.max(1, currentMonth - 1)]
    const cachedMonths = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter((m) => !freshMonths.includes(m) && m < currentMonth)

    // 1. Read cached aggregations for closed months
    const aggByMonth: Record<number, MonthAgg> = {}
    for (let m = 1; m <= 12; m++) aggByMonth[m] = emptyAgg()

    if (cachedMonths.length > 0) {
      const cacheKeys = cachedMonths.map((m) => `objectives_agg_2026_${m}`)
      const { data: cached } = await supabase
        .from("data_cache")
        .select("key, data")
        .in("key", cacheKeys)

      for (const row of (cached || [])) {
        const m = parseInt(row.key.split("_").pop() || "0")
        if (m > 0 && m <= 12 && row.data) {
          aggByMonth[m] = row.data as MonthAgg
        }
      }
    }

    // 2. Fetch fresh orders from Shopify for recent months only
    let totalOrdersFetched = 0
    for (const m of freshMonths) {
      if (m < 1 || m > 12) continue
      const startDate = `2026-${String(m).padStart(2, "0")}-01T00:00:00Z`
      const endDate = m === currentMonth
        ? now.toISOString()
        : `2026-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`

      const orders = await getAllOrders({
        created_at_min: startDate,
        created_at_max: endDate,
      })
      totalOrdersFetched += orders.length
      aggByMonth[m] = aggregateOrders(orders)
    }

    // 3. Cache freshly computed months that are now closed (previous month)
    for (const m of freshMonths) {
      if (m < currentMonth && m >= 1) {
        // This month is closed — cache it for next sync
        await supabase.from("data_cache").upsert({
          key: `objectives_agg_2026_${m}`,
          data: aggByMonth[m],
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" })
      }
    }

    // 4. Also cache any closed months that were missing from cache
    for (const m of cachedMonths) {
      if (aggByMonth[m].orders === 0 && m < currentMonth) {
        // Not in cache yet — fetch and cache
        const startDate = `2026-${String(m).padStart(2, "0")}-01T00:00:00Z`
        const endDate = `2026-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`
        const orders = await getAllOrders({
          created_at_min: startDate,
          created_at_max: endDate,
        })
        totalOrdersFetched += orders.length
        aggByMonth[m] = aggregateOrders(orders)
        await supabase.from("data_cache").upsert({
          key: `objectives_agg_2026_${m}`,
          data: aggByMonth[m],
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" })
      }
    }

    // 5. Compute generosity + breakdown per month
    // EXCLUDES retours (CS-Retour) — these are SAV replacements, not real generosity
    const updateErrors: string[] = []
    for (let m = 1; m <= 12; m++) {
      const a = aggByMonth[m]
      const totalGenerosite = a.discounts + a.prix_barres - a.retours
      const pct = a.ca_brut > 0
        ? Math.round((totalGenerosite / a.ca_brut) * 10000) / 100
        : 0
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

      const { error: updateErr } = await supabase
        .from("objectives_2026")
        .update({
          generosite: pct,
          generosite_detail: detail,
          updated_at: new Date().toISOString(),
        })
        .eq("month", m)

      if (updateErr) updateErrors.push(`Month ${m}: ${updateErr.message}`)
    }

    if (updateErrors.length > 0) {
      console.error("Update errors:", updateErrors)
      return NextResponse.json({ error: updateErrors.join("; ") }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      orders_fetched: totalOrdersFetched,
      cached_months: cachedMonths,
      fresh_months: freshMonths,
      updated_fields: ["generosite", "generosite_detail"],
      preserved_fields: ["ca_2025", "ca_2026", "media_spent"],
    })
  } catch (error) {
    console.error("Objectives sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}
