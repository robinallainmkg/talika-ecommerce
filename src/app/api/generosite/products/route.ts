import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface ProductStats {
  product_id: number
  title: string
  quantity_sold: number
  revenue: number // prix payé
  ca_brut: number // prix catalogue (compare_at_price ou price)
  discount_allocated: number // part des discounts allouée
  generosite_pct: number
  avg_price: number
  avg_compare_at: number
  prix_barre_discount: number // compare_at - price
  orders: number
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || "2026")
    const month = searchParams.get("month") // optional - if null, all months of year

    // Determine which months to fetch
    const months = month ? [parseInt(month)] : Array.from({ length: 12 }, (_, i) => i + 1)

    // Fetch all orders for the period
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders: any[] = []
    for (const m of months) {
      const { data: cacheEntry } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `shopify_orders_${year}_${m}`)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orders = (cacheEntry?.data as any)?.orders || []
      allOrders.push(...orders)
    }

    if (allOrders.length === 0) {
      return NextResponse.json({ products: [], period: { year, month: month ? parseInt(month) : null } })
    }

    // Aggregate per product
    const productMap = new Map<string, ProductStats>()

    for (const order of allOrders) {
      const orderDiscount = parseFloat(order.total_discounts || "0")
      const lineItems = order.line_items || []

      // Calculate total line item value (for proportional discount allocation)
      let orderLineTotal = 0
      for (const item of lineItems) {
        orderLineTotal += parseFloat(item.price || "0") * (item.quantity || 1)
      }

      for (const item of lineItems) {
        const price = parseFloat(item.price || "0")
        const compareAt = parseFloat(item.compare_at_price || "0")
        const qty = item.quantity || 1
        const productId = item.product_id || 0
        const title = item.title || "Inconnu"
        const key = `${productId}_${title}`

        // Prix barré discount
        const prixBarreDiscount = (compareAt > price && compareAt > 0)
          ? (compareAt - price) * qty
          : 0

        // Proportional allocation of order-level discount to this line item
        const lineValue = price * qty
        const discountShare = orderLineTotal > 0
          ? (lineValue / orderLineTotal) * orderDiscount
          : 0

        const existing = productMap.get(key)
        if (existing) {
          existing.quantity_sold += qty
          existing.revenue += lineValue
          existing.ca_brut += (compareAt > 0 ? compareAt : price) * qty
          existing.discount_allocated += discountShare
          existing.prix_barre_discount += prixBarreDiscount
          existing.orders += 1
        } else {
          productMap.set(key, {
            product_id: productId,
            title,
            quantity_sold: qty,
            revenue: lineValue,
            ca_brut: (compareAt > 0 ? compareAt : price) * qty,
            discount_allocated: discountShare,
            prix_barre_discount: prixBarreDiscount,
            generosite_pct: 0,
            avg_price: 0,
            avg_compare_at: 0,
            orders: 1,
          })
        }
      }
    }

    // Compute final stats
    const products: ProductStats[] = []
    for (const p of productMap.values()) {
      const totalGenerosite = p.discount_allocated + p.prix_barre_discount
      p.generosite_pct = p.ca_brut > 0
        ? Math.round((totalGenerosite / p.ca_brut) * 1000) / 10
        : 0
      p.avg_price = p.quantity_sold > 0
        ? Math.round((p.revenue / p.quantity_sold) * 100) / 100
        : 0
      p.avg_compare_at = p.quantity_sold > 0
        ? Math.round((p.ca_brut / p.quantity_sold) * 100) / 100
        : 0
      products.push(p)
    }

    // Sort by total generosity amount (highest first)
    products.sort((a, b) =>
      (b.discount_allocated + b.prix_barre_discount) - (a.discount_allocated + a.prix_barre_discount)
    )

    // Summary stats
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
    const totalCaBrut = products.reduce((s, p) => s + p.ca_brut, 0)
    const totalDiscountAllocated = products.reduce((s, p) => s + p.discount_allocated, 0)
    const totalPrixBarre = products.reduce((s, p) => s + p.prix_barre_discount, 0)
    const overallGenerosite = totalCaBrut > 0
      ? Math.round(((totalDiscountAllocated + totalPrixBarre) / totalCaBrut) * 1000) / 10
      : 0

    return NextResponse.json({
      period: { year, month: month ? parseInt(month) : null },
      summary: {
        total_products: products.length,
        total_revenue: Math.round(totalRevenue),
        total_ca_brut: Math.round(totalCaBrut),
        total_discount_codes: Math.round(totalDiscountAllocated),
        total_prix_barres: Math.round(totalPrixBarre),
        overall_generosite_pct: overallGenerosite,
      },
      products: products.slice(0, 50), // Top 50
    })
  } catch (error) {
    console.error("Generosite products error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}
