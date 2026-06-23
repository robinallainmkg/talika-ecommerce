import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadExcludedKeys, billingKey } from "@/lib/influence/billing-status"

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

    // Get ACTUAL influence cost from manual data (commissions + fixed fees)
    // Commissions are MANUAL (from CSV), NOT auto-calculated from commission_rate
    const { data: monthCommissions } = await supabase
      .from("influencer_commissions")
      .select("influencer_id, amount")
      .eq("year", year)
      .eq("month", month)

    const { data: monthFees } = await supabase
      .from("influencer_fixed_fees")
      .select("influencer_id, amount")
      .eq("year", year)
      .eq("month", month)

    // Collabs "sans facturation" → leur coût ne compte pas (MER/CAC). On somme
    // l'exclu à part pour transparence.
    const excludedKeys = await loadExcludedKeys({ year })
    const isExcluded = (id: string) => excludedKeys.has(billingKey(id, year, month))
    const totalCommissions = (monthCommissions || []).reduce(
      (s, r) => s + (isExcluded(r.influencer_id) ? 0 : parseFloat(r.amount) || 0), 0
    )
    const totalFixedFees = (monthFees || []).reduce(
      (s, r) => s + (isExcluded(r.influencer_id) ? 0 : parseFloat(r.amount) || 0), 0
    )
    const influenceExcludedAmount = Math.round(
      [...(monthCommissions || []), ...(monthFees || [])].reduce(
        (s, r) => s + (isExcluded(r.influencer_id) ? parseFloat(r.amount) || 0 : 0), 0
      )
    )
    const influenceCost = totalCommissions + totalFixedFees

    // Check if commission data exists for this month (for "??" display)
    const hasCommissionData = (monthCommissions || []).length > 0 || (monthFees || []).length > 0

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

    // ── 4b. VRAIS nouveaux clients par canal ──
    // Fonction Postgres acquisition_new_customers : un "nouveau client" = email dont la
    // 1re commande JAMAIS passée (tout l'historique) tombe ce mois. Canal = présence d'un
    // code influenceur. Remplace l'ancien comptage (clients uniques + splits inventés
    // *0.15/*0.6) qui faussait le CAC. L'influence est attribuable au code ; Meta/direct/SEO
    // tombent dans "other" (pas séparables par 1re commande, attribution pixel ≠).
    const { data: ncRows } = await supabase.rpc("acquisition_new_customers", {
      p_year: year,
      p_month: month,
    })
    const ncMap: Record<string, { orders: number; new_customers: number }> = {}
    for (const r of (ncRows as Array<{ channel: string; orders: number; new_customers: number }>) || []) {
      ncMap[r.channel] = { orders: Number(r.orders), new_customers: Number(r.new_customers) }
    }
    const ncInfluence = ncMap.influence?.new_customers || 0
    const ncOther = ncMap.other?.new_customers || 0
    const ordersInfluenceNC = ncMap.influence?.orders || 0
    const ordersOtherNC = ncMap.other?.orders || 0
    const totalNewCustomers = ncInfluence + ncOther
    const pctNcInfluence = ordersInfluenceNC > 0 ? (ncInfluence / ordersInfluenceNC) * 100 : 0
    const pctNcOther = ordersOtherNC > 0 ? (ncOther / ordersOtherNC) * 100 : 0

    // CAC sur les VRAIS nouveaux clients (pas les clients uniques)
    const otherSpend = metaSpend + googleSpend
    const cpaInfluence = ncInfluence > 0 && influenceCost > 0 ? influenceCost / ncInfluence : null
    const cacOther = ncOther > 0 && otherSpend > 0 ? otherSpend / ncOther : null

    // ── 5. Organic / Direct (everything not attributed) ──
    const organicRevenue = Math.max(0, totalRevenue - influenceRevenue - metaRevenue - googleRevenue)
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
        new_customers: ncInfluence,
        cpa: cpaInfluence,
        pending: !hasCommissionData,
        kpis: {
          influencers_actifs: influenceInfluencers,
          aov: influenceOrders > 0 ? influenceRevenue / influenceOrders : 0,
          commissions: totalCommissions,
          fixed_fees: totalFixedFees,
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
        new_customers: null, // non attribuable : Meta = pixel, pas de 1re commande fiable → voir Boussole
        cpa: null,
        note: "ROAS Meta sur-attribué (l'influence recrute, Meta convertit). Se fier à la Boussole (MER + %NC).",
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
        new_customers: null,
        cpa: null,
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
        new_customers: ncOther,
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
      // Boussole anti-attribution : MER + CAC nouveau client + %NC par canal (cf knowledge_base
      // strategy:attribution-blend). Ignore les guerres d'attribution Meta/influence.
      compass: {
        mer: blendedRoas,
        total_spend: totalSpend,
        total_revenue: totalRevenue,
        new_customers: totalNewCustomers,
        cac_new_customer: totalSpend > 0 && totalNewCustomers > 0 ? totalSpend / totalNewCustomers : null,
        // Le coût influence (commissions + fees) est saisi à la main, souvent après clôture.
        // Tant qu'il manque, MER/CAC sous-estiment la dépense → drapeau pour l'UI. Le %NC reste fiable.
        influence_cost_pending: !hasCommissionData,
        // Coût influence retiré car collabs "sans facturation" (transparence).
        influence_sans_facturation_excluded: influenceExcludedAmount,
        channels: [
          { id: "influence", name: "Influence", new_customers: ncInfluence, orders: ordersInfluenceNC, pct_nc: pctNcInfluence, spend: influenceCost, cac: cpaInfluence },
          { id: "other", name: "Autre (Meta / direct / SEO…)", new_customers: ncOther, orders: ordersOtherNC, pct_nc: pctNcOther, spend: otherSpend, cac: cacOther },
        ],
      },
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
