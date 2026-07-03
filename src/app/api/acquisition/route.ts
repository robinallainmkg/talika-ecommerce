import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadExcludedKeys, billingKey } from "@/lib/influence/billing-status"
import { classifyOrder, paidTouch, utmCoverage, type AttributionChannel, type CachedOrder } from "@/lib/attribution"

// fetch no-store explicite : Next patche fetch() et peut servir les lectures
// Supabase depuis son Data Cache disque (vécu en dev : commandes de juin figées
// au 23/06 alors que la base était à jour). Un dashboard ne doit JAMAIS être stale.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) } }
)

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const CHANNEL_META: Record<AttributionChannel, { name: string; color: string }> = {
  influence: { name: "Influence (code)", color: "#8b5cf6" },
  google_ads: { name: "Google Ads", color: "#f59e0b" },
  meta_ads: { name: "Meta Ads", color: "#3b82f6" },
  email: { name: "Email (Klaviyo)", color: "#14b8a6" },
  seo: { name: "SEO", color: "#10b981" },
  direct: { name: "Direct / autres", color: "#a1a1aa" },
}

const monthKey = (prefix: string, y: number, m: number) => `${prefix}_${y}_${m}`

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth

    // Clés des 6 mois de tendance (mois sélectionné inclus, année à cheval gérée)
    const trendMonths: Array<{ y: number; m: number }> = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      trendMonths.push({ y: d.getFullYear(), m: d.getMonth() + 1 })
    }
    const trendOrderKeys = trendMonths.map(({ y, m }) => monthKey("shopify_orders", y, m))
    const adsKeys = trendMonths.flatMap(({ y, m }) => [
      monthKey("meta_monthly", y, m),
      monthKey("google_ads", y, m),
    ])
    const prevYearKey = monthKey("shopify_orders", year - 1, month)

    // ── Fetches parallèles ──
    const [
      ordersCacheRes,
      infCodesRes,
      commissionsRes,
      feesRes,
      metaCacheRes,
      metaCampaignsRes,
      googleCacheRes,
      ncRes,
      trendRes,
      paceRes,
      adsCachesRes,
      freshnessRes,
    ] = await Promise.all([
      supabase.from("data_cache").select("data, updated_at").eq("key", monthKey("shopify_orders", year, month)).single(),
      supabase.from("influencer_codes").select("code").eq("code_type", "influencer").eq("is_active", true),
      supabase.from("influencer_commissions").select("influencer_id, amount").eq("year", year).eq("month", month),
      supabase.from("influencer_fixed_fees").select("influencer_id, amount").eq("year", year).eq("month", month),
      supabase.from("data_cache").select("data, updated_at").eq("key", monthKey("meta_monthly", year, month)).single(),
      supabase.from("data_cache").select("data").eq("key", monthKey("meta_campaigns", year, month)).single(),
      supabase.from("data_cache").select("data, updated_at").eq("key", monthKey("google_ads", year, month)).single(),
      supabase.rpc("acquisition_new_customers", { p_year: year, p_month: month }),
      supabase.rpc("acquisition_monthly_totals", { p_keys: trendOrderKeys, p_day_max: null }),
      // Pacing à périmètre égal : même mois N-1, borné au même jour si mois partiel
      supabase.rpc("acquisition_monthly_totals", {
        p_keys: [prevYearKey],
        p_day_max: isCurrentMonth ? dayOfMonth : null,
      }),
      supabase.from("data_cache").select("key, data").in("key", adsKeys),
      supabase.from("data_cache").select("key, updated_at").in("key", [
        monthKey("shopify_orders", year, month),
        monthKey("meta_monthly", year, month),
        monthKey("google_ads", year, month),
      ]),
    ])

    // ── Commandes du mois (source de vérité TTC) ──
    const orders: CachedOrder[] = (ordersCacheRes.data?.data as any)?.orders || []
    const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
    const totalOrders = orders.length

    // ── Coût influence réel (saisi à la main), hors collabs "sans facturation" ──
    const excludedKeys = await loadExcludedKeys({ year })
    const isExcluded = (id: string) => excludedKeys.has(billingKey(id, year, month))
    const totalCommissions = (commissionsRes.data || []).reduce(
      (s, r) => s + (isExcluded(r.influencer_id) ? 0 : parseFloat(r.amount) || 0), 0
    )
    const totalFixedFees = (feesRes.data || []).reduce(
      (s, r) => s + (isExcluded(r.influencer_id) ? 0 : parseFloat(r.amount) || 0), 0
    )
    const influenceCost = totalCommissions + totalFixedFees
    const hasCommissionData =
      (commissionsRes.data || []).length > 0 || (feesRes.data || []).length > 0

    // ── Plateformes : dépense réelle + revendications (attribution pixel) ──
    const metaSummary = (metaCacheRes.data?.data as any)?.summary || {}
    const metaSpend = parseFloat(metaSummary.spend || "0")
    const metaRoas = parseFloat(metaSummary.roas || "0")
    const metaClaimedRevenue = metaSpend * metaRoas
    const metaCampaigns = (metaCampaignsRes.data?.data as any)?.campaigns || []

    const googleSummary = (googleCacheRes.data?.data as any)?.summary || {}
    const googleCampaigns = (googleCacheRes.data?.data as any)?.campaigns || []
    const googleSpend = googleSummary.spend || 0
    const googleClaimedRevenue = googleSummary.conversions_value || 0
    const googleRoas = googleSummary.roas || 0

    // ── Partition déterministe par commande (somme = 100 % du CA) ──
    const codeSet = new Set((infCodesRes.data || []).map((c) => c.code.toUpperCase()))
    const coverage = utmCoverage(orders)
    const buckets: Record<AttributionChannel, { orders: number; revenue: number }> = {
      influence: { orders: 0, revenue: 0 },
      google_ads: { orders: 0, revenue: 0 },
      meta_ads: { orders: 0, revenue: 0 },
      email: { orders: 0, revenue: 0 },
      seo: { orders: 0, revenue: 0 },
      direct: { orders: 0, revenue: 0 },
    }
    // Overlap : commandes à code AUSSI touchées par une pub dans la session d'achat
    const overlapTouched = {
      meta: { orders: 0, revenue: 0 },
      google: { orders: 0, revenue: 0 },
    }
    for (const o of orders) {
      const price = parseFloat(o.total_price || "0")
      const channel = classifyOrder(o, codeSet)
      buckets[channel].orders++
      buckets[channel].revenue += price
      if (channel === "influence") {
        const touch = paidTouch(o)
        if (touch) {
          overlapTouched[touch].orders++
          overlapTouched[touch].revenue += price
        }
      }
    }
    const attributionChannels = (Object.keys(buckets) as AttributionChannel[]).map((id) => ({
      id,
      name: CHANNEL_META[id].name,
      color: CHANNEL_META[id].color,
      orders: buckets[id].orders,
      revenue: Math.round(buckets[id].revenue),
      share: totalRevenue > 0 ? (buckets[id].revenue / totalRevenue) * 100 : 0,
    }))

    // ── Vrais nouveaux clients (RPC : 1re commande jamais passée) ──
    const ncMap: Record<string, { orders: number; new_customers: number }> = {}
    for (const r of (ncRes.data as Array<{ channel: string; orders: number; new_customers: number }>) || []) {
      ncMap[r.channel] = { orders: Number(r.orders), new_customers: Number(r.new_customers) }
    }
    const ncInfluence = ncMap.influence?.new_customers || 0
    const ncOther = ncMap.other?.new_customers || 0
    const ordersInfluenceNC = ncMap.influence?.orders || 0
    const ordersOtherNC = ncMap.other?.orders || 0
    const totalNewCustomers = ncInfluence + ncOther
    const otherSpend = metaSpend + googleSpend
    const cpaInfluence = ncInfluence > 0 && influenceCost > 0 ? influenceCost / ncInfluence : null
    const cacOther = ncOther > 0 && otherSpend > 0 ? otherSpend / ncOther : null

    // ── Tendance 6 mois : CA (RPC) + dépenses ads (caches) ──
    const trendTotals = new Map(
      ((trendRes.data as Array<{ key: string; revenue: number; orders: number }>) || []).map((r) => [
        r.key,
        { revenue: Number(r.revenue), orders: Number(r.orders) },
      ])
    )
    const adsCaches = new Map(
      ((adsCachesRes.data as Array<{ key: string; data: any }>) || []).map((r) => [r.key, r.data])
    )
    const trend = trendMonths.map(({ y, m }) => {
      const totals = trendTotals.get(monthKey("shopify_orders", y, m))
      const metaData = adsCaches.get(monthKey("meta_monthly", y, m))
      const googleData = adsCaches.get(monthKey("google_ads", y, m))
      const mSpend = parseFloat(metaData?.summary?.spend || "0")
      const gSpend = googleData?.summary?.spend || 0
      const revenue = totals?.revenue || 0
      const ads = mSpend + gSpend
      return {
        ym: `${y}-${String(m).padStart(2, "0")}`,
        revenue: Math.round(revenue),
        orders: totals?.orders || 0,
        ads_spend: Math.round(ads),
        ratio: ads > 0 ? Math.round((revenue / ads) * 10) / 10 : null,
      }
    })

    // ── Pacing : même mois N-1 (Shopify, même périmètre TTC), objectif = N-1 × 1,20 ──
    const paceRow = ((paceRes.data as Array<{ key: string; revenue: number }>) || [])[0]
    const prevYearSameDays = paceRow ? Number(paceRow.revenue) : null
    const pace =
      prevYearSameDays && prevYearSameDays > 0
        ? {
            prev_year_same_days: Math.round(prevYearSameDays),
            target_same_days: Math.round(prevYearSameDays * 1.2),
            vs_prev_year_pct: (totalRevenue / prevYearSameDays - 1) * 100,
            vs_target_pct: (totalRevenue / (prevYearSameDays * 1.2)) * 100,
          }
        : null

    // ── Fraîcheur par source ──
    const freshness = ((freshnessRes.data as Array<{ key: string; updated_at: string }>) || []).map(
      (r) => ({
        source: r.key.startsWith("shopify") ? "shopify" : r.key.startsWith("meta") ? "meta" : "google",
        updated_at: r.updated_at,
      })
    )

    // ── KPIs globaux ──
    const totalSpend = influenceCost + metaSpend + googleSpend
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0
    const influenceBucket = buckets.influence

    // ── Cartes canaux (mesuré vs revendiqué) ──
    const channels = [
      {
        id: "influence",
        name: "Influence",
        measured: true,
        color: "#8b5cf6",
        revenue: Math.round(influenceBucket.revenue),
        orders: influenceBucket.orders,
        spend: influenceCost,
        roas: influenceCost > 0 ? influenceBucket.revenue / influenceCost : null,
        share: totalRevenue > 0 ? (influenceBucket.revenue / totalRevenue) * 100 : 0,
        new_customers: ncInfluence,
        nc_rate: ordersInfluenceNC > 0 ? (ncInfluence / ordersInfluenceNC) * 100 : null,
        cpa: cpaInfluence,
        pending: !hasCommissionData,
        kpis: {
          aov: influenceBucket.orders > 0 ? influenceBucket.revenue / influenceBucket.orders : 0,
          commissions: totalCommissions,
          fixed_fees: totalFixedFees,
        },
      },
      {
        id: "meta",
        name: "Meta Ads",
        measured: false,
        color: "#3b82f6",
        claimed_revenue: Math.round(metaClaimedRevenue),
        measured_revenue: Math.round(buckets.meta_ads.revenue),
        measured_orders: buckets.meta_ads.orders,
        spend: metaSpend,
        roas: metaRoas,
        kpis: {
          impressions: parseInt(metaSummary.impressions || "0"),
          clicks: parseInt(metaSummary.clicks || "0"),
          cpm: parseFloat(metaSummary.cpm || "0"),
          campaigns: metaCampaigns.length,
        },
        note: "ROAS auto-déclaré (pixel, 7j clic / 1j vue) — la contribution mesurée en session d'achat est bien plus basse. Arbitre : le MER.",
      },
      {
        id: "google",
        name: "Google Ads",
        measured: false,
        color: "#f59e0b",
        claimed_revenue: Math.round(googleClaimedRevenue),
        measured_revenue: Math.round(buckets.google_ads.revenue),
        measured_orders: buckets.google_ads.orders,
        spend: googleSpend,
        roas: googleRoas,
        kpis: {
          impressions: googleSummary.impressions || 0,
          clicks: googleSummary.clicks || 0,
          campaigns: googleCampaigns.filter((c: any) => c.spend > 0).length,
        },
        blocked: googleSpend === 0 && googleCampaigns.length === 0,
        note: "Surtout brand search — une partie récolte la demande créée par l'influence (cf. overlap).",
      },
    ]

    return NextResponse.json({
      period: { year, month },
      partial: { is_current: isCurrentMonth, day: dayOfMonth, days_in_month: daysInMonth },
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      total_spend: totalSpend,
      blended_roas: blendedRoas,
      total_new_customers: totalNewCustomers,
      blended_cpa: totalSpend > 0 && totalNewCustomers > 0 ? totalSpend / totalNewCustomers : null,
      pace,
      // Partition déterministe (une commande = un canal, code > pub > email > SEO > direct)
      attribution: {
        available: coverage > 0.5,
        coverage,
        channels: attributionChannels,
      },
      // L'overlap mesuré : commandes à code aussi touchées par une pub dans la session d'achat
      overlap: {
        influence_orders: influenceBucket.orders,
        influence_revenue: Math.round(influenceBucket.revenue),
        meta_touched_orders: overlapTouched.meta.orders,
        meta_touched_revenue: Math.round(overlapTouched.meta.revenue),
        google_touched_orders: overlapTouched.google.orders,
        google_touched_revenue: Math.round(overlapTouched.google.revenue),
        meta_claimed_revenue: Math.round(metaClaimedRevenue),
        google_claimed_revenue: Math.round(googleClaimedRevenue),
        claims_sum_pct:
          totalRevenue > 0
            ? ((influenceBucket.revenue + metaClaimedRevenue + googleClaimedRevenue) / totalRevenue) * 100
            : 0,
      },
      compass: {
        mer: blendedRoas,
        total_spend: totalSpend,
        total_revenue: totalRevenue,
        new_customers: totalNewCustomers,
        cac_new_customer:
          totalSpend > 0 && totalNewCustomers > 0 ? totalSpend / totalNewCustomers : null,
        influence_cost_pending: !hasCommissionData,
        channels: [
          { id: "influence", name: "Influence", new_customers: ncInfluence, orders: ordersInfluenceNC, pct_nc: ordersInfluenceNC > 0 ? (ncInfluence / ordersInfluenceNC) * 100 : 0, spend: influenceCost, cac: cpaInfluence },
          { id: "other", name: "Autre (pub / SEO / direct)", new_customers: ncOther, orders: ordersOtherNC, pct_nc: ordersOtherNC > 0 ? (ncOther / ordersOtherNC) * 100 : 0, spend: otherSpend, cac: cacOther },
        ],
      },
      trend,
      freshness,
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
