import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Product breakdown per influencer
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const influencerId = searchParams.get("influencer_id")

    if (influencerId) {
      // Single influencer product breakdown
      const { data, error } = await supabase
        .from("influencer_product_sales")
        .select("product_title, product_id, quantity, line_price")
        .eq("influencer_id", influencerId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Aggregate by product
      const productMap: Record<string, { title: string; quantity: number; revenue: number; orders: number }> = {}
      for (const row of data || []) {
        const key = row.product_title
        if (!productMap[key]) {
          productMap[key] = { title: key, quantity: 0, revenue: 0, orders: 0 }
        }
        productMap[key].quantity += row.quantity
        productMap[key].revenue += parseFloat(row.line_price)
        productMap[key].orders += 1
      }

      const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)

      return NextResponse.json({ products })
    }

    // All influencers: top products summary
    const { data, error } = await supabase
      .from("influencer_product_sales")
      .select("influencer_id, product_title, quantity, line_price")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Aggregate: top products across all influencers
    const globalProducts: Record<string, { title: string; quantity: number; revenue: number; influencer_count: number; influencers: Set<string> }> = {}

    for (const row of data || []) {
      const key = row.product_title
      if (!globalProducts[key]) {
        globalProducts[key] = { title: key, quantity: 0, revenue: 0, influencer_count: 0, influencers: new Set() }
      }
      globalProducts[key].quantity += row.quantity
      globalProducts[key].revenue += parseFloat(row.line_price)
      globalProducts[key].influencers.add(row.influencer_id)
    }

    const products = Object.values(globalProducts)
      .map(p => ({ ...p, influencer_count: p.influencers.size, influencers: undefined }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50)

    return NextResponse.json({ products, total_records: (data || []).length })
  } catch (error) {
    console.error("Influencer products error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch products" },
      { status: 500 }
    )
  }
}

// POST: Sync product sales from Shopify orders cache
export async function POST() {
  try {
    // Get all influencer codes
    const { data: codes, error: codesError } = await supabase
      .from("influencer_codes")
      .select("code, influencer_id")
      .eq("is_active", true)
      .eq("code_type", "influencer")

    if (codesError) {
      return NextResponse.json({ error: "Failed to fetch codes: " + codesError.message }, { status: 500 })
    }

    if (!codes || codes.length === 0) {
      return NextResponse.json({ synced: 0, note: "No influencer codes found" })
    }

    const codeMap = new Map(codes.map(c => [c.code.toUpperCase(), c.influencer_id]))

    // Get cached Shopify orders - fetch keys first, then data per key
    const { data: cacheKeys } = await supabase
      .from("data_cache")
      .select("key")
      .eq("source", "shopify")
      .like("key", "shopify_orders_%")

    const debug = {
      codes_count: codes.length,
      code_list: codes.map(c => c.code),
      cache_keys: (cacheKeys || []).map(k => k.key),
      orders_found: 0,
      orders_with_discount: 0,
      matched_codes: 0,
      errors: [] as string[],
    }

    let totalSynced = 0

    for (const keyEntry of cacheKeys || []) {
      // Fetch each cache entry individually to avoid size limits
      const { data: cacheEntry } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", keyEntry.key)
        .single()

      if (!cacheEntry?.data) {
        debug.errors.push(`No data for key ${keyEntry.key}`)
        continue
      }

      const orders = (cacheEntry.data as any)?.orders || []
      debug.orders_found += orders.length

      for (const order of orders) {
        const discountCodes = order.discount_codes || []
        if (discountCodes.length === 0) continue
        debug.orders_with_discount++

        // Handle both array of objects and potential string format
        const orderCodes: string[] = []
        for (const dc of discountCodes) {
          if (typeof dc === "string") {
            orderCodes.push(dc.toUpperCase().trim())
          } else if (dc.code) {
            orderCodes.push(dc.code.toUpperCase().trim())
          }
        }

        for (const code of orderCodes) {
          const influencerId = codeMap.get(code)
          if (!influencerId) continue
          debug.matched_codes++

          const lineItems = order.line_items || []
          for (const item of lineItems) {
            // TTC APRÈS remise quand le cache porte les discount_allocations
            // (caches écrits depuis juil. 2026) ; sinon fallback prix catalogue.
            const gross = parseFloat(item.price || "0") * (item.quantity || 1)
            const lineDiscount = (item.discount_allocations || []).reduce(
              (s: number, a: { amount?: string }) => s + (parseFloat(a.amount || "0") || 0), 0)
            const { error } = await supabase
              .from("influencer_product_sales")
              .insert({
                influencer_id: influencerId,
                discount_code: code,
                shopify_order_id: String(order.id),
                order_date: order.created_at,
                product_id: String(item.product_id),
                product_title: item.title || "Unknown",
                variant_id: item.variant_id ? String(item.variant_id) : null,
                variant_title: item.variant_title || null,
                sku: item.sku || null,
                quantity: item.quantity || 1,
                line_price: Math.max(0, gross - lineDiscount),
              })

            if (error) {
              // Duplicate = already synced, that's OK
              if (error.code === "23505") continue
              debug.errors.push(`Insert error: ${error.message}`)
            } else {
              totalSynced++
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced: totalSynced,
      debug,
    })
  } catch (error) {
    console.error("Product sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}
