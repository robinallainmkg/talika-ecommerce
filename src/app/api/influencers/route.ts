import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─── Types for Shopify data_cache ─────────────────────────────────
interface ShopifyDiscountCode {
  code: string
  amount: string
}
interface ShopifyOrder {
  id: number | string
  total_price: string
  total_discounts: string
  discount_codes: ShopifyDiscountCode[]
  created_at: string
}

// GET: List all influencers with computed stats from Shopify orders
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || "2026")
    const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null // null = all year

    // 1. Fetch influencers with their codes
    const { data: influencers, error } = await supabase
      .from("influencers")
      .select(`*, influencer_codes (*)`)
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Fetch fixed fees for the year (or specific month)
    let feesQuery = supabase.from("influencer_fixed_fees").select("*").eq("year", year)
    if (month) feesQuery = feesQuery.eq("month", month)
    const { data: allFees } = await feesQuery

    // 3. Fetch Shopify orders from data_cache (year or specific month)
    const cachePattern = month
      ? `shopify_orders_${year}_${month}`
      : `shopify_orders_${year}_%`
    const { data: cacheEntries } = await supabase
      .from("data_cache")
      .select("key, data")
      .like("key", cachePattern)

    // Parse all orders for the year
    // data_cache format: { count: N, orders: [...] } or direct array
    const allOrders: ShopifyOrder[] = []
    if (cacheEntries) {
      for (const entry of cacheEntries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = entry.data as any
        const orders: ShopifyOrder[] = Array.isArray(raw) ? raw : (raw?.orders || [])
        allOrders.push(...orders)
      }
    }

    // 4. Build code → influencer mapping
    const codeToInfluencer = new Map<string, string>() // code → influencer_id
    const influencerCodes = new Map<string, string[]>() // influencer_id → codes[]
    if (influencers) {
      for (const inf of influencers) {
        const codes: string[] = []
        if (inf.influencer_codes) {
          for (const c of inf.influencer_codes) {
            const codeUpper = c.code.toUpperCase()
            codeToInfluencer.set(codeUpper, inf.id)
            codes.push(codeUpper)
          }
        }
        influencerCodes.set(inf.id, codes)
      }
    }

    // 5. Compute per-influencer stats from orders
    const stats = new Map<string, { sales: number; orders: number; commissions: number }>()

    for (const order of allOrders) {
      if (!order.discount_codes || order.discount_codes.length === 0) continue

      for (const dc of order.discount_codes) {
        const codeUpper = dc.code.toUpperCase()
        const influencerId = codeToInfluencer.get(codeUpper)
        if (!influencerId) continue

        if (!stats.has(influencerId)) {
          stats.set(influencerId, { sales: 0, orders: 0, commissions: 0 })
        }
        const s = stats.get(influencerId)!
        const orderTotal = parseFloat(order.total_price) || 0
        s.sales += orderTotal
        s.orders += 1
        // Commission = order total * commission_rate / 100
        const inf = influencers?.find((i) => i.id === influencerId)
        const rate = inf?.commission_rate ?? 0
        s.commissions += orderTotal * (rate / 100)
        break // count order once per influencer
      }
    }

    // 6. Compute fixed fees per influencer for the year
    const feesMap = new Map<string, number>()
    if (allFees) {
      for (const fee of allFees) {
        const current = feesMap.get(fee.influencer_id) || 0
        feesMap.set(fee.influencer_id, current + (fee.amount || 0))
      }
    }

    // 7. Enrich influencers with computed stats
    const enriched = (influencers || []).map((inf) => {
      const s = stats.get(inf.id) || { sales: 0, orders: 0, commissions: 0 }
      const fixedFees = feesMap.get(inf.id) || 0
      return {
        ...inf,
        total_sales: Math.round(s.sales),
        total_orders: s.orders,
        total_commissions: Math.round(s.commissions),
        total_fixed_fees: Math.round(fixedFees),
      }
    })

    // Sort by total_sales desc
    enriched.sort((a, b) => b.total_sales - a.total_sales)

    return NextResponse.json({ influencers: enriched, year })
  } catch (error) {
    console.error("Influencers GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch influencers" },
      { status: 500 }
    )
  }
}

// POST: Create a new influencer
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const insertData: Record<string, unknown> = {
      name: body.name,
      instagram_handle: body.instagram_handle || null,
      tiktok_handle: body.tiktok_handle || null,
      email: body.email || null,
      phone: body.phone || null,
      tier: body.tier || null,
      category: body.category || null,
      status: body.status || "active",
      commission_rate: body.commission_rate ?? 12,
      notes: body.notes || null,
      has_fixed_fee: body.has_fixed_fee || false,
      fixed_fee_amount: body.fixed_fee_amount || 0,
      total_sales: 0,
      total_orders: 0,
      total_commissions: 0,
      total_fixed_fees: 0,
    }

    const { data, error } = await supabase
      .from("influencers")
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ influencer: data })
  } catch (error) {
    console.error("Influencers POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create influencer" },
      { status: 500 }
    )
  }
}

// PATCH: Update an influencer
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const allowedFields = [
      "name", "instagram_handle", "tiktok_handle", "email", "phone",
      "tier", "category", "status", "commission_rate", "notes",
      "has_fixed_fee", "fixed_fee_amount", "metadata",
    ]

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    const { data, error } = await supabase
      .from("influencers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ influencer: data })
  } catch (error) {
    console.error("Influencers PATCH error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update influencer" },
      { status: 500 }
    )
  }
}
