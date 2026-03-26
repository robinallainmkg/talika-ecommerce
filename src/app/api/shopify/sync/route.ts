import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAnalytics, getProducts, getCustomers, getAllOrders } from "@/lib/integrations/shopify"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const syncType = body.type || "all" // "all" | "orders" | "products" | "analytics" | "influencer_sales"
    const results: Record<string, any> = {}

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

    // --- Sync Analytics (KPIs) ---
    if (syncType === "all" || syncType === "analytics") {
      const analytics = await getAnalytics({
        created_at_min: monthStart,
        created_at_max: monthEnd,
      })

      // Cache in data_cache
      await supabase.from("data_cache").upsert({
        key: `shopify_analytics_${now.getFullYear()}_${now.getMonth() + 1}`,
        data: analytics,
        source: "shopify",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h TTL
      })

      // Upsert P&L revenue entry (match real DB schema: category_id + date)
      const { data: revenueCat } = await supabase
        .from("pnl_categories")
        .select("id")
        .eq("is_revenue", true)
        .single()

      if (revenueCat) {
        const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        await supabase.from("pnl_entries").upsert(
          {
            category_id: revenueCat.id,
            date: monthDate,
            amount: analytics.total_revenue - analytics.total_refunds,
            description: "Shopify Net Revenue",
            source: "shopify",
            source_ref: `sync_${now.toISOString()}`,
          },
          { onConflict: "category_id,date,source" }
        )
      }

      results.analytics = {
        revenue: analytics.total_revenue,
        orders: analytics.total_orders,
        aov: analytics.aov,
        customers: analytics.unique_customers,
      }
    }

    // --- Sync Orders (lightweight format to save DB space) ---
    if (syncType === "all" || syncType === "orders") {
      const rawOrders = await getAllOrders({
        created_at_min: monthStart,
        created_at_max: monthEnd,
      })

      // Strip to essential fields only (~500 bytes/order instead of ~12KB)
      const orders = rawOrders.map((o: any) => ({
        id: o.id,
        email: o.email || "",
        total_price: o.total_price,
        total_discounts: o.total_discounts,
        created_at: o.created_at,
        discount_codes: (o.discount_codes || []).map((dc: any) => ({
          code: typeof dc === "string" ? dc : dc.code || "",
          amount: typeof dc === "string" ? "0" : dc.amount || "0",
          type: typeof dc === "string" ? "" : dc.type || "",
        })),
        discount_applications: (o.discount_applications || []).map((da: any) => ({
          target_type: da.target_type,
          type: da.type,
          value: da.value,
        })),
        line_items: (o.line_items || []).map((li: any) => ({
          product_id: li.product_id,
          title: li.title,
          variant_id: li.variant_id,
          variant_title: li.variant_title,
          sku: li.sku,
          quantity: li.quantity,
          price: li.price,
          compare_at_price: li.compare_at_price,
        })),
        shipping_lines: (o.shipping_lines || []).map((sl: any) => ({
          title: sl.title,
          price: sl.price,
        })),
      }))

      await supabase.from("data_cache").upsert({
        key: `shopify_orders_${now.getFullYear()}_${now.getMonth() + 1}`,
        data: { orders, count: orders.length },
        source: "shopify",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min TTL
      }, { onConflict: "key" })

      results.orders = { count: orders.length }
    }

    // --- Sync Products ---
    if (syncType === "all" || syncType === "products") {
      const products = await getProducts(250)

      await supabase.from("data_cache").upsert({
        key: "shopify_products",
        data: products,
        source: "shopify",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h TTL
      })

      results.products = { count: (products.products || []).length }
    }

    // --- Sync Influencer Sales (codes → orders → product line items) ---
    if (syncType === "all" || syncType === "influencer_sales") {
      // Get influencer codes from the real table
      const { data: infCodes } = await supabase
        .from("influencer_codes")
        .select("code, influencer_id")
        .eq("is_active", true)
        .eq("code_type", "influencer")

      if (infCodes && infCodes.length > 0) {
        const codeMap = new Map(infCodes.map(c => [c.code.toUpperCase(), c.influencer_id]))

        // Get orders from cache
        const { data: cachedOrders } = await supabase
          .from("data_cache")
          .select("data")
          .eq("key", `shopify_orders_${now.getFullYear()}_${now.getMonth() + 1}`)
          .single()

        const orders = (cachedOrders?.data as any)?.orders || []
        let matchedOrders = 0
        let syncedProducts = 0

        // Track per-influencer totals for this month
        const influencerTotals: Record<string, { sales: number; orders: number }> = {}

        for (const order of orders) {
          const discountCodes = order.discount_codes || []
          for (const dc of discountCodes) {
            const code = (typeof dc === "string" ? dc : dc.code || "").toUpperCase().trim()
            const influencerId = codeMap.get(code)
            if (!influencerId) continue
            matchedOrders++

            // Track totals
            if (!influencerTotals[influencerId]) influencerTotals[influencerId] = { sales: 0, orders: 0 }
            influencerTotals[influencerId].sales += parseFloat(order.total_price || "0")
            influencerTotals[influencerId].orders += 1

            // Sync product-level sales
            for (const item of order.line_items || []) {
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
                  line_price: parseFloat(item.price || "0") * (item.quantity || 1),
                })
              if (error?.code === "23505") continue // duplicate, already synced
              if (!error) syncedProducts++
            }
          }
        }

        // Update influencer totals (aggregate from influencer_product_sales for accuracy)
        for (const [influencerId] of Object.entries(influencerTotals)) {
          const { data: prodSales } = await supabase
            .from("influencer_product_sales")
            .select("line_price, shopify_order_id")
            .eq("influencer_id", influencerId)

          if (prodSales) {
            const totalSales = prodSales.reduce((s, r) => s + parseFloat(r.line_price), 0)
            const uniqueOrders = new Set(prodSales.map(r => r.shopify_order_id)).size
            await supabase
              .from("influencers")
              .update({ total_sales: totalSales, total_orders: uniqueOrders })
              .eq("id", influencerId)
          }
        }

        results.influencer_sales = {
          matched_orders: matchedOrders,
          synced_products: syncedProducts,
          influencers_updated: Object.keys(influencerTotals).length,
        }
      } else {
        results.influencer_sales = { matched_orders: 0, note: "No influencer codes found" }
      }
    }

    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error("Shopify sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Return last sync status from cache
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from("data_cache")
    .select("key, source, expires_at, created_at")
    .eq("source", "shopify")
    .order("created_at", { ascending: false })

  return NextResponse.json({
    last_syncs: data || [],
    note: "POST to this endpoint to trigger a sync",
  })
}
