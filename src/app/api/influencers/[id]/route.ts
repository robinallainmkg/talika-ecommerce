import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface DiscountCode {
  code: string
  amount: string
}

interface LineItem {
  sku: string
  price: string
  title: string
  quantity: number
  product_id: number | string
  variant_id: number | string
}

interface ShopifyOrder {
  id: number | string
  total_price: string
  total_discounts: string
  discount_codes: DiscountCode[]
  line_items: LineItem[]
  created_at: string
}

interface ProductAgg {
  title: string
  quantity: number
  revenue: number
  orders: number
}

interface MonthlyAgg {
  month: string
  revenue: number
  orders: number
}

// GET: Full influencer deep dive data
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 1. Fetch influencer + codes
    const { data: influencer, error: infError } = await supabase
      .from("influencers")
      .select(`*, influencer_codes (*)`)
      .eq("id", id)
      .single()

    if (infError || !influencer) {
      return NextResponse.json(
        { error: infError?.message || "Influencer not found" },
        { status: 404 }
      )
    }

    // 2. Get all discount codes for this influencer (case-insensitive matching)
    const codes: string[] = (influencer.influencer_codes || []).map(
      (c: { code: string }) => c.code.toUpperCase().trim()
    )

    // 3. Get fixed fees
    const { data: fixedFees } = await supabase
      .from("influencer_fixed_fees")
      .select("*")
      .eq("influencer_id", id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })

    // 4. Get content items
    const { data: content } = await supabase
      .from("influencer_content")
      .select("*")
      .eq("influencer_id", id)
      .order("posted_at", { ascending: false })

    // 5. Parse orders from data_cache to build product breakdown + timeline
    const productMap: Record<string, ProductAgg> = {}
    const monthlyMap: Record<string, MonthlyAgg> = {}
    const recentOrders: {
      date: string
      amount: number
      products: string[]
      discount_code: string
    }[] = []
    let totalRevenue = 0
    let totalOrders = 0

    if (codes.length > 0) {
      // Fetch cache keys
      const { data: cacheKeys } = await supabase
        .from("data_cache")
        .select("key")
        .eq("source", "shopify")
        .like("key", "shopify_orders_%")

      for (const keyEntry of cacheKeys || []) {
        const { data: cacheEntry } = await supabase
          .from("data_cache")
          .select("data")
          .eq("key", keyEntry.key)
          .single()

        if (!cacheEntry?.data) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawData = cacheEntry.data as any
        const orders: ShopifyOrder[] = rawData?.orders || []

        for (const order of orders) {
          const discountCodes = order.discount_codes || []
          if (discountCodes.length === 0) continue

          const orderCodes: string[] = discountCodes.map((dc) =>
            (typeof dc === "string" ? dc : dc.code).toUpperCase().trim()
          )

          const matchedCode = orderCodes.find((c) => codes.includes(c))
          if (!matchedCode) continue

          const orderTotal = parseFloat(order.total_price || "0")
          totalRevenue += orderTotal
          totalOrders++

          // Monthly aggregation
          const monthKey = order.created_at
            ? order.created_at.substring(0, 7)
            : "unknown"
          if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = { month: monthKey, revenue: 0, orders: 0 }
          }
          monthlyMap[monthKey].revenue += orderTotal
          monthlyMap[monthKey].orders++

          // Product aggregation
          const productNames: string[] = []
          for (const item of order.line_items || []) {
            const title = item.title || "Unknown"
            productNames.push(title)
            if (!productMap[title]) {
              productMap[title] = { title, quantity: 0, revenue: 0, orders: 0 }
            }
            productMap[title].quantity += item.quantity || 1
            productMap[title].revenue +=
              parseFloat(item.price || "0") * (item.quantity || 1)
            productMap[title].orders++
          }

          // Recent orders
          recentOrders.push({
            date: order.created_at,
            amount: orderTotal,
            products: productNames,
            discount_code: matchedCode,
          })
        }
      }
    }

    // Sort products by revenue desc
    const products = Object.values(productMap).sort(
      (a, b) => b.revenue - a.revenue
    )

    // Sort monthly timeline
    const timeline = Object.values(monthlyMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    )

    // Sort recent orders by date desc, take 10
    recentOrders.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    const lastOrders = recentOrders.slice(0, 10)

    // Average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // ROAS
    const totalCost =
      (influencer.total_commissions || 0) + (influencer.total_fixed_fees || 0)
    const roas = totalCost > 0 ? totalRevenue / totalCost : 0

    return NextResponse.json({
      influencer,
      products,
      timeline,
      lastOrders,
      fixedFees: fixedFees || [],
      content: content || [],
      stats: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        roas,
        totalCost,
      },
    })
  } catch (error) {
    console.error("Influencer detail GET error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch influencer",
      },
      { status: 500 }
    )
  }
}
