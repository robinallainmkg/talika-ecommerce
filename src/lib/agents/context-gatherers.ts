import { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Shared context gathering functions for all agents
// ---------------------------------------------------------------------------

export async function gatherBaseContext(
  supabase: SupabaseClient,
  agentId: string
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {}

  // Recent proposals for this agent (avoid duplicates)
  const { data: recentProposals } = await supabase
    .from("agent_proposals")
    .select("title, description, category, priority, status, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(10)
  context.recent_proposals = recentProposals ?? []

  return context
}

// ---------------------------------------------------------------------------
// Influencer Agent Context
// ---------------------------------------------------------------------------

export async function gatherInfluencerContext(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  const context = await gatherBaseContext(supabase, "influencers")

  // 1. All influencers with totals
  const { data: influencers } = await supabase
    .from("influencers")
    .select("id, name, total_sales, total_orders, total_commissions, total_fixed_fees, commission_rate, has_fixed_fee")
    .order("total_sales", { ascending: false })

  // 2. All influencer codes
  const { data: codes } = await supabase
    .from("influencer_codes")
    .select("id, code, influencer_id, discount_percent, is_active, code_type")

  // 3. Product sales breakdown (from influencer_product_sales)
  const { data: productSales } = await supabase
    .from("influencer_product_sales")
    .select("influencer_id, product_title, discount_code, quantity, line_price")
    .order("line_price", { ascending: false })
    .limit(500)

  // 4. Aggregate product sales per influencer
  const productsByInfluencer: Record<string, Record<string, { quantity: number; revenue: number }>> = {}
  for (const sale of productSales || []) {
    const iid = sale.influencer_id
    if (!productsByInfluencer[iid]) productsByInfluencer[iid] = {}
    const products = productsByInfluencer[iid]
    const title = sale.product_title
    if (!products[title]) products[title] = { quantity: 0, revenue: 0 }
    products[title].quantity += sale.quantity
    products[title].revenue += parseFloat(sale.line_price)
  }

  // 5. Build enriched influencer list
  const codeMap = new Map((codes || []).map(c => [c.influencer_id, c]))
  const enrichedInfluencers = (influencers || []).map(inf => {
    const infCodes = (codes || []).filter(c => c.influencer_id === inf.id)
    const products = productsByInfluencer[inf.id] || {}
    const topProducts = Object.entries(products)
      .map(([title, data]) => ({ title, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    const totalCost = parseFloat(inf.total_commissions || "0") + parseFloat(inf.total_fixed_fees || "0")
    const totalSales = parseFloat(inf.total_sales || "0")
    const roi = totalCost > 0 ? totalSales / totalCost : null

    return {
      name: inf.name,
      codes: infCodes.map(c => c.code),
      total_sales: totalSales,
      total_orders: inf.total_orders,
      total_commissions: parseFloat(inf.total_commissions || "0"),
      total_fixed_fees: parseFloat(inf.total_fixed_fees || "0"),
      total_cost: totalCost,
      roi,
      top_products: topProducts,
    }
  })

  context.influencers = enrichedInfluencers
  context.total_influencers = enrichedInfluencers.length
  context.total_influencer_sales = enrichedInfluencers.reduce((s, i) => s + i.total_sales, 0)
  context.total_influencer_cost = enrichedInfluencers.reduce((s, i) => s + i.total_cost, 0)

  // 6. Objectives 2026
  const { data: objectives } = await supabase
    .from("objectives_2026")
    .select("month, ca_2025, target_2026, ca_2026, media_spent, generosity")
    .order("month")
  context.objectives_2026 = objectives ?? []

  return context
}

// ---------------------------------------------------------------------------
// Sales Agent Context
// ---------------------------------------------------------------------------

export async function gatherSalesContext(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  const context = await gatherBaseContext(supabase, "sales")

  // Shopify analytics
  const { data: shopifyData } = await supabase
    .from("data_cache")
    .select("key, data")
    .eq("source", "shopify")

  for (const entry of shopifyData || []) {
    if (entry.key.startsWith("shopify_analytics")) {
      context.shopify_analytics = entry.data
    } else if (entry.key.startsWith("shopify_orders")) {
      const orders = (entry.data as any)?.orders || []
      context.orders_summary = {
        count: orders.length,
        total_revenue: orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0),
        avg_order_value: orders.length ? orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0) / orders.length : 0,
        top_discount_codes: Array.from(new Set(orders.flatMap((o: any) => (o.discount_codes || []).map((d: any) => d.code)))).slice(0, 20),
      }
    } else if (entry.key === "shopify_products") {
      const products = (entry.data as any)?.products || []
      context.products_summary = {
        count: products.length,
        active: products.filter((p: any) => p.status === "active").length,
        product_types: Array.from(new Set(products.map((p: any) => p.product_type).filter(Boolean))),
      }
    }
  }

  // Objectives
  const { data: objectives } = await supabase
    .from("objectives_2026")
    .select("*")
    .order("month")
  context.objectives_2026 = objectives ?? []

  return context
}

// ---------------------------------------------------------------------------
// Meta Ads Agent Context
// ---------------------------------------------------------------------------

export async function gatherMetaAdsContext(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  const context = await gatherBaseContext(supabase, "meta_ads")

  const { data: metaData } = await supabase
    .from("data_cache")
    .select("key, data")
    .eq("source", "meta")

  for (const entry of metaData || []) {
    if (entry.key.startsWith("meta_campaigns")) {
      context.campaigns = (entry.data as any)?.campaigns || []
    } else if (entry.key.startsWith("meta_monthly")) {
      context.monthly_summary = (entry.data as any)?.summary || {}
      context.monthly_trend = (entry.data as any)?.trend || []
    }
  }

  // Objectives for media spend tracking
  const { data: objectives } = await supabase
    .from("objectives_2026")
    .select("month, media_spent, ca_2026")
    .order("month")
  context.objectives_2026 = objectives ?? []

  return context
}

// ---------------------------------------------------------------------------
// Klaviyo Agent Context
// ---------------------------------------------------------------------------

export async function gatherKlaviyoContext(
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  const context = await gatherBaseContext(supabase, "klaviyo")

  const { data: klaviyoData } = await supabase
    .from("data_cache")
    .select("key, data")
    .eq("source", "klaviyo")

  for (const entry of klaviyoData || []) {
    context[entry.key] = entry.data
  }

  return context
}

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

export async function gatherContext(
  supabase: SupabaseClient,
  agentId: string
): Promise<Record<string, unknown>> {
  switch (agentId) {
    case "influencers":
      return gatherInfluencerContext(supabase)
    case "sales":
    case "traffic":
      return gatherSalesContext(supabase)
    case "meta_ads":
      return gatherMetaAdsContext(supabase)
    case "klaviyo":
      return gatherKlaviyoContext(supabase)
    default:
      return gatherBaseContext(supabase, agentId)
  }
}
