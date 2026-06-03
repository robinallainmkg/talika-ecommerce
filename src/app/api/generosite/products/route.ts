import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface VariantStats {
  product_id: number
  variant_id: number
  title: string
  variant_title: string
  sku: string
  quantity_sold: number
  revenue: number
  ca_brut: number
  discount_allocated: number
  prix_barre_discount: number
  generosite_pct: number
  avg_price: number
  avg_compare_at: number
  orders: number
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || "2026")
    const month = searchParams.get("month")

    const months = month ? [parseInt(month)] : Array.from({ length: 12 }, (_, i) => i + 1)

    const allOrders: any[] = []
    for (const m of months) {
      const { data: cacheEntry } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `shopify_orders_${year}_${m}`)
        .single()
      const orders = (cacheEntry?.data as any)?.orders || []
      allOrders.push(...orders)
    }

    if (allOrders.length === 0) {
      return NextResponse.json({ products: [], period: { year, month: month ? parseInt(month) : null } })
    }

    const variantMap = new Map<string, VariantStats>()

    for (const order of allOrders) {
      if (order.financial_status === "voided" || order.cancelled_at) continue
      const orderDiscount = parseFloat(order.total_discounts || "0")
      const lineItems = order.line_items || []

      let orderLineTotal = 0
      for (const item of lineItems) {
        orderLineTotal += parseFloat(item.price || "0") * (item.quantity || 1)
      }

      for (const item of lineItems) {
        const price = parseFloat(item.price || "0")
        const compareAt = parseFloat(item.compare_at_price || "0")
        const qty = item.quantity || 1
        const variantId = item.variant_id || 0
        const sku = item.sku || ""
        const key = variantId ? String(variantId) : `${item.product_id}_${sku}`

        const catalogPrice = (compareAt > price && compareAt > 0) ? compareAt : price
        const prixBarreDiscount = (compareAt > price && compareAt > 0) ? (compareAt - price) * qty : 0

        const lineValue = price * qty
        const discountShare = orderLineTotal > 0 ? (lineValue / orderLineTotal) * orderDiscount : 0

        const existing = variantMap.get(key)
        if (existing) {
          existing.quantity_sold += qty
          existing.revenue += lineValue
          existing.ca_brut += catalogPrice * qty
          existing.discount_allocated += discountShare
          existing.prix_barre_discount += prixBarreDiscount
          existing.orders += 1
        } else {
          variantMap.set(key, {
            product_id: item.product_id || 0,
            variant_id: variantId,
            title: item.title || "Inconnu",
            variant_title: item.variant_title || "",
            sku,
            quantity_sold: qty,
            revenue: lineValue,
            ca_brut: catalogPrice * qty,
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

    const products: VariantStats[] = []
    for (const p of variantMap.values()) {
      const totalGen = p.discount_allocated + p.prix_barre_discount
      p.generosite_pct = p.ca_brut > 0 ? Math.round((totalGen / p.ca_brut) * 1000) / 10 : 0
      p.avg_price = p.quantity_sold > 0 ? Math.round((p.revenue / p.quantity_sold) * 100) / 100 : 0
      p.avg_compare_at = p.quantity_sold > 0 ? Math.round((p.ca_brut / p.quantity_sold) * 100) / 100 : 0
      p.discount_allocated = Math.round(p.discount_allocated * 100) / 100
      p.prix_barre_discount = Math.round(p.prix_barre_discount * 100) / 100
      p.revenue = Math.round(p.revenue * 100) / 100
      p.ca_brut = Math.round(p.ca_brut * 100) / 100
      products.push(p)
    }

    products.sort((a, b) =>
      (b.discount_allocated + b.prix_barre_discount) - (a.discount_allocated + a.prix_barre_discount)
    )

    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
    const totalCaBrut = products.reduce((s, p) => s + p.ca_brut, 0)
    const totalDiscount = products.reduce((s, p) => s + p.discount_allocated, 0)
    const totalPrixBarre = products.reduce((s, p) => s + p.prix_barre_discount, 0)

    return NextResponse.json({
      period: { year, month: month ? parseInt(month) : null },
      summary: {
        total_variants: products.length,
        total_revenue: Math.round(totalRevenue),
        total_ca_brut: Math.round(totalCaBrut),
        total_discount_codes: Math.round(totalDiscount),
        total_prix_barres: Math.round(totalPrixBarre),
        overall_generosite_pct: totalCaBrut > 0 ? Math.round(((totalDiscount + totalPrixBarre) / totalCaBrut) * 1000) / 10 : 0,
      },
      products,
    })
  } catch (error) {
    console.error("Generosite products error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
