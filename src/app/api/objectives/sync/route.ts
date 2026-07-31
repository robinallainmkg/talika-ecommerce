/**
 * POST /api/objectives/sync
 *
 * Syncs generosity data into objectives_2026 using the CANONICAL computation
 * from src/lib/generosite.ts (table-driven via influencer_codes.code_type).
 *
 * ONLY updates: generosite, generosite_detail
 * PRESERVES: ca_2025, ca_2026, media_spent (manually entered)
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAllOrders } from "@/lib/integrations/shopify"
import { loadCodeCategoryMap, computeGenerosite } from "@/lib/generosite"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 min (Vercel Pro) — évite le timeout du bouton sync

export async function POST() {
  try {
    const now = new Date()
    const currentMonth = now.getMonth() + 1

    const categoryMap = await loadCodeCategoryMap()

    const freshMonths = [currentMonth, Math.max(1, currentMonth - 1)]
    const cachedMonths = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter((m) => !freshMonths.includes(m) && m < currentMonth)

    // Read cached results for closed months
    const resultByMonth: Record<number, ReturnType<typeof computeGenerosite> | null> = {}
    for (let m = 1; m <= 12; m++) resultByMonth[m] = null

    if (cachedMonths.length > 0) {
      const cacheKeys = cachedMonths.map((m) => `objectives_gen_2026_${m}`)
      const { data: cached } = await supabase
        .from("data_cache")
        .select("key, data")
        .in("key", cacheKeys)

      for (const row of cached || []) {
        const m = parseInt(row.key.split("_").pop() || "0")
        if (m > 0 && m <= 12 && row.data) {
          resultByMonth[m] = row.data as any
        }
      }
    }

    // Fetch fresh orders for recent months
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
      resultByMonth[m] = computeGenerosite(orders, categoryMap)
    }

    // Cache closed months + backfill missing
    // ⚠️ data_cache.source est NOT NULL : sans lui l'upsert échoue en 23502.
    // C'est resté silencieux (erreur jamais lue) pendant des mois → le cache ne
    // persistait JAMAIS et janv–mai étaient re-téléchargés de Shopify chaque run
    // (~220 s), ce qui faisait dépasser les 300 s au cron. On loggue désormais.
    for (const m of [...freshMonths, ...cachedMonths]) {
      if (m < 1 || m >= currentMonth) continue
      if (resultByMonth[m]) {
        const { error: cacheErr } = await supabase.from("data_cache").upsert({
          key: `objectives_gen_2026_${m}`,
          data: resultByMonth[m],
          source: "objectives",
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" })
        if (cacheErr) console.error(`[objectives] cache mois ${m} non écrit: ${cacheErr.message}`)
      }
    }

    // Backfill missing cached months
    for (const m of cachedMonths) {
      if (resultByMonth[m]) continue
      const startDate = `2026-${String(m).padStart(2, "0")}-01T00:00:00Z`
      const endDate = `2026-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`
      const orders = await getAllOrders({
        created_at_min: startDate,
        created_at_max: endDate,
      })
      totalOrdersFetched += orders.length
      resultByMonth[m] = computeGenerosite(orders, categoryMap)
      const { error: cacheErr } = await supabase.from("data_cache").upsert({
        key: `objectives_gen_2026_${m}`,
        data: resultByMonth[m],
        source: "objectives",
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" })
      if (cacheErr) console.error(`[objectives] backfill mois ${m} non écrit: ${cacheErr.message}`)
    }

    // Write generosity to objectives_2026
    const updateErrors: string[] = []
    for (let m = 1; m <= 12; m++) {
      const r = resultByMonth[m]
      if (!r || r.total_orders === 0) continue

      const detail = {
        ca_brut: r.ca_brut,
        total_discount: r.total_discount,
        prix_barres: r.prix_barres,
        by_category: r.by_category,
      }

      const { error: updateErr } = await supabase
        .from("objectives_2026")
        .update({
          generosite: r.generosite_rate,
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
