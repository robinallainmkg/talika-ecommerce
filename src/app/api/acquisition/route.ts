import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))
    const monthStart = new Date(year, month - 1, 1).toISOString()
    const monthEnd = new Date(year, month, 0, 23, 59, 59).toISOString()

    // ── 1. Total Shopify CA this month ──
    // Try analytics cache first, fallback to computing from orders
    const { data: analyticsCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_analytics_${year}_${month}`)
      .single()

    let totalRevenue = (analyticsCache?.data as any)?.total_revenue || 0
    let totalOrders = (analyticsCache?.data as any)?.total_orders || 0

    // If no analytics cache, compute from orders cache
    if (totalRevenue === 0) {
      const { data: ordersCache } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `shopify_orders_${year}_${month}`)
        .single()

      const orders = (ordersCache?.data as any)?.orders || []
      if (orders.length > 0) {
        totalRevenue = orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0)
        totalOrders = orders.length
      }
    }

    // ── 2. Influence channel ──
    const { data: influenceData } = await supabase
      .from("influencer_product_sales")
      .select("line_price, shopify_order_id, influencer_id")
      .gte("order_date", monthStart)
      .lt("order_date", monthEnd)

    const influenceRevenue = (influenceData || []).reduce(
      (s, r) => s + parseFloat(r.line_price), 0
    )
    const influenceOrders = new Set((influenceData || []).map(r => r.shopify_order_id)).size
    const influenceInfluencers = new Set((influenceData || []).map(r => r.influencer_id)).size

    // Estimate influence cost: get commission rates from influencers who sold this month
    const activeInfluencerIds = Array.from(new Set((influenceData || []).map(r => r.influencer_id)))
    let influenceCost = 0
    if (activeInfluencerIds.length > 0) {
      const { data: influencers } = await supabase
        .from("influencers")
        .select("id, commission_rate, has_fixed_fee, fixed_fee_amount")
        .in("id", activeInfluencerIds)

      // Per-influencer revenue this month
      const revByInf: Record<string, number> = {}
      for (const r of influenceData || []) {
        revByInf[r.influencer_id] = (revByInf[r.influencer_id] || 0) + parseFloat(r.line_price)
      }

      for (const inf of influencers || []) {
        const rev = revByInf[inf.id] || 0
        // Commission on this month's sales only (rate stored as %, e.g. 12 = 12%)
        const rate = parseFloat(inf.commission_rate || "10")
        const commission = rev * (rate > 1 ? rate / 100 : rate)
        // Fixed fees are historical totals from CSV — NOT monthly.
        // Only count commission for monthly cost calculation.
        influenceCost += commission
      }
    }

    // ── 3. Meta Ads channel ──
    const { data: metaCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `meta_monthly_${year}_${month}`)
      .single()

    const metaSummary = (metaCache?.data as any)?.summary || {}
    const metaSpend = parseFloat(metaSummary.spend || "0")
    const metaRoas = parseFloat(metaSummary.roas || "0")
    const metaRevenue = metaSpend * metaRoas // attributed revenue
    const metaImpressions = parseInt(metaSummary.impressions || "0")
    const metaClicks = parseInt(metaSummary.clicks || "0")
    const metaCpm = parseFloat(metaSummary.cpm || "0")

    // Meta campaigns detail
    const { data: metaCampaignsCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `meta_campaigns_${year}_${month}`)
      .single()
    const metaCampaigns = (metaCampaignsCache?.data as any)?.campaigns || []

    // ── 4. Google Ads channel ──
    const { data: googleCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `google_ads_${year}_${month}`)
      .single()

    const googleSummary = (googleCache?.data as any)?.summary || {}
    const googleCampaigns = (googleCache?.data as any)?.campaigns || []
    const googleSpend = googleSummary.spend || 0
    const googleRevenue = googleSummary.conversions_value || 0
    const googleRoas = googleSummary.roas || 0
    const googleClicks = googleSummary.clicks || 0
    const googleImpressions = googleSummary.impressions || 0
    const googleConversions = googleSummary.conversions || 0

    // ── 4b. New vs returning customers analysis ──
    // Fetch orders from cache to analyze customer emails + discount codes
    const { data: ordersCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${year}_${month}`)
      .single()

    const orders = (ordersCache?.data as any)?.orders || []

    // Build set of influencer codes for matching
    const { data: infCodes } = await supabase
      .from("influencer_codes")
      .select("code")
      .eq("code_type", "influencer")
      .eq("is_active", true)
    const influencerCodeSet = new Set((infCodes || []).map(c => c.code.toUpperCase()))

    // Count unique customers this month and attribute by channel
    // Use email from order to identify unique buyers
    const emailToChannel: Record<string, string> = {}
    const uniqueEmails = new Set<string>()

    for (const order of orders) {
      const email = (order.email || "").toLowerCase().trim()
      if (!email) continue
      uniqueEmails.add(email)

      const codes = (order.discount_codes || []).map((d: any) =>
        (typeof d === "string" ? d : d.code || "").toUpperCase().trim()
      )

      const hasInfluencerCode = codes.some((c: string) => influencerCodeSet.has(c))
      if (hasInfluencerCode && !emailToChannel[email]) {
        emailToChannel[email] = "influence"
      } else if (!emailToChannel[email]) {
        emailToChannel[email] = "organic"
      }
    }

    // Total unique customers this month
    const totalUniqueCustomers = uniqueEmails.size

    // New customers attributed to influence = unique emails that bought with an influencer code
    const newCustomersInfluence = Object.values(emailToChannel).filter(c => c === "influence").length
    const newCustomersOrganic = Object.values(emailToChannel).filter(c => c === "organic").length

    // Google new customers from conversions data
    const newCustomersGoogle = Math.round(googleConversions * 0.6)

    // Total new customers estimate
    const totalNewCustomers = totalUniqueCustomers

    // CPA calculations
    const cpaInfluence = newCustomersInfluence > 0 ? influenceCost / newCustomersInfluence : null
    const cpaMeta = metaSpend > 0 ? metaSpend / Math.max(1, Math.round(totalNewCustomers * 0.15)) : null
    const cpaGoogle = newCustomersGoogle > 0 ? googleSpend / newCustomersGoogle : null

    // ── 5. Organic / Direct (everything not attributed) ──
    const attributedRevenue = influenceRevenue + metaRevenue + googleRevenue
    const organicRevenue = Math.max(0, totalRevenue - influenceRevenue) // don't double-subtract Meta
    const organicOrders = totalOrders - influenceOrders

    // ── 6. Build channel breakdown ──
    const totalSpend = influenceCost + metaSpend + googleSpend
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const channels = [
      {
        id: "influence",
        name: "Influence",
        icon: "Users",
        color: "#8b5cf6",
        revenue: influenceRevenue,
        orders: influenceOrders,
        spend: influenceCost,
        roas: influenceCost > 0 ? influenceRevenue / influenceCost : 0,
        share: totalRevenue > 0 ? (influenceRevenue / totalRevenue) * 100 : 0,
        new_customers: newCustomersInfluence,
        cpa: cpaInfluence,
        kpis: {
          influencers_actifs: influenceInfluencers,
          aov: influenceOrders > 0 ? influenceRevenue / influenceOrders : 0,
        },
      },
      {
        id: "meta",
        name: "Meta Ads",
        icon: "Megaphone",
        color: "#3b82f6",
        revenue: metaRevenue,
        orders: 0, // Meta doesn't give order count easily
        spend: metaSpend,
        roas: metaRoas,
        share: totalRevenue > 0 ? (metaRevenue / totalRevenue) * 100 : 0,
        kpis: {
          impressions: metaImpressions,
          clicks: metaClicks,
          cpm: metaCpm,
          campaigns: metaCampaigns.length,
        },
        new_customers: Math.round(totalNewCustomers * 0.15), // ~15% attributed to Meta
        cpa: cpaMeta,
        note: "ROAS Meta potentiellement sur-attribué (influence recrute, Meta convertit)",
      },
      {
        id: "google",
        name: "Google Ads",
        icon: "Search",
        color: "#f59e0b",
        revenue: googleRevenue,
        orders: Math.round(googleConversions),
        spend: googleSpend,
        roas: googleRoas,
        share: totalRevenue > 0 ? (googleRevenue / totalRevenue) * 100 : 0,
        kpis: {
          impressions: googleImpressions,
          clicks: googleClicks,
          cpm: googleImpressions > 0 ? (googleSpend / googleImpressions) * 1000 : 0,
          campaigns: googleCampaigns.filter((c: any) => c.spend > 0).length,
        },
        new_customers: newCustomersGoogle,
        cpa: cpaGoogle,
        blocked: googleSpend === 0 && googleCampaigns.length === 0,
        note: googleSpend > 0 ? "" : "Aucune donnée — lancez une sync Google Ads",
      },
      {
        id: "organic",
        name: "Organique / Direct",
        icon: "Globe",
        color: "#10b981",
        revenue: organicRevenue,
        orders: organicOrders,
        spend: 0,
        roas: null,
        share: totalRevenue > 0 ? (organicRevenue / totalRevenue) * 100 : 0,
        new_customers: newCustomersOrganic,
        cpa: null,
        kpis: {},
      },
    ]

    return NextResponse.json({
      period: { year, month },
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      total_spend: totalSpend,
      blended_roas: blendedRoas,
      total_new_customers: totalNewCustomers,
      blended_cpa: totalSpend > 0 && totalNewCustomers > 0 ? totalSpend / totalNewCustomers : null,
      channels,
      meta_campaigns: metaCampaigns.slice(0, 10),
    })
  } catch (error) {
    console.error("Acquisition API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}
