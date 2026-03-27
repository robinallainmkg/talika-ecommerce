import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface Insight {
  id: string
  title: string
  description: string
  severity: "info" | "warning" | "success" | "critical"
  category: string
  page: string
}

// ── Helper: get orders for a given month ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrders(year: number, month: number): Promise<any[]> {
  const { data } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", `shopify_orders_${year}_${month}`)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.data as any)?.orders || []
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = searchParams.get("page") || "dashboard"
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const insights: Insight[] = []

    // Get current and previous month orders
    const currentOrders = await getOrders(year, month)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevOrders = await getOrders(prevYear, prevMonth)

    const currentRevenue = currentOrders.reduce((s: number, o: { total_price?: string }) => s + parseFloat(o.total_price || "0"), 0)
    const prevRevenue = prevOrders.reduce((s: number, o: { total_price?: string }) => s + parseFloat(o.total_price || "0"), 0)
    const currentDiscount = currentOrders.reduce((s: number, o: { total_discounts?: string }) => s + parseFloat(o.total_discounts || "0"), 0)

    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(year, month, 0).getDate()
    const projectedRevenue = dayOfMonth > 0 ? (currentRevenue / dayOfMonth) * daysInMonth : 0

    // ── Dashboard insights ──
    if (page === "dashboard" || page === "all") {
      // Revenue trend
      if (prevRevenue > 0) {
        const revChange = ((currentRevenue - prevRevenue) / prevRevenue) * 100
        if (revChange > 10) {
          insights.push({
            id: "dashboard-rev-up",
            title: `CA en hausse de ${Math.round(revChange)}% vs mois dernier`,
            description: `${Math.round(currentRevenue).toLocaleString("fr-FR")}€ déjà ce mois vs ${Math.round(prevRevenue).toLocaleString("fr-FR")}€ le mois dernier. Projection fin de mois : ~${Math.round(projectedRevenue).toLocaleString("fr-FR")}€`,
            severity: "success",
            category: "revenue",
            page: "dashboard",
          })
        } else if (revChange < -10) {
          insights.push({
            id: "dashboard-rev-down",
            title: `CA en baisse de ${Math.round(Math.abs(revChange))}% vs mois dernier`,
            description: `Seulement ${Math.round(currentRevenue).toLocaleString("fr-FR")}€ à J${dayOfMonth}. Projection : ~${Math.round(projectedRevenue).toLocaleString("fr-FR")}€ (vs ${Math.round(prevRevenue).toLocaleString("fr-FR")}€ le mois dernier).`,
            severity: "warning",
            category: "revenue",
            page: "dashboard",
          })
        }
      }

      // AOV comparison
      const currentAOV = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0
      const prevAOV = prevOrders.length > 0 ? prevRevenue / prevOrders.length : 0
      if (prevAOV > 0 && currentAOV > 0) {
        const aovDiff = currentAOV - prevAOV
        if (aovDiff > 5) {
          insights.push({
            id: "dashboard-aov-up",
            title: `Panier moyen en hausse : ${Math.round(currentAOV)}€ (+${Math.round(aovDiff)}€)`,
            description: `Le panier moyen a progressé de ${Math.round(prevAOV)}€ à ${Math.round(currentAOV)}€. Les stratégies d'upsell fonctionnent.`,
            severity: "success",
            category: "aov",
            page: "dashboard",
          })
        } else if (aovDiff < -5) {
          insights.push({
            id: "dashboard-aov-down",
            title: `Panier moyen en baisse : ${Math.round(currentAOV)}€ (${Math.round(aovDiff)}€)`,
            description: `Le panier moyen a baissé de ${Math.round(prevAOV)}€ à ${Math.round(currentAOV)}€. Vérifiez les promotions et les offres bundlées.`,
            severity: "warning",
            category: "aov",
            page: "dashboard",
          })
        }
      }
    }

    // ── Sales insights ──
    if (page === "sales" || page === "all") {
      // Top product analysis
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const productQty: Record<string, { qty: number; revenue: number }> = {}
      for (const order of currentOrders) {
        for (const item of order.line_items || []) {
          const title = item.title || "Inconnu"
          if (!productQty[title]) productQty[title] = { qty: 0, revenue: 0 }
          productQty[title].qty += item.quantity || 1
          productQty[title].revenue += parseFloat(item.price || "0") * (item.quantity || 1)
        }
      }

      const sortedProducts = Object.entries(productQty)
        .sort((a, b) => b[1].revenue - a[1].revenue)

      if (sortedProducts.length > 0) {
        const topProduct = sortedProducts[0]
        const topPct = currentRevenue > 0 ? Math.round((topProduct[1].revenue / currentRevenue) * 100) : 0
        insights.push({
          id: "sales-top-product",
          title: `Top produit : ${topProduct[0]} (${topPct}% du CA)`,
          description: `${topProduct[1].qty} unités vendues pour ${Math.round(topProduct[1].revenue).toLocaleString("fr-FR")}€. ${
            topPct > 30 ? "Forte concentration — diversifier les ventes pourrait réduire le risque." : ""
          }`,
          severity: topPct > 40 ? "warning" : "info",
          category: "product",
          page: "sales",
        })
      }
    }

    // ── Generosity insights ──
    if (page === "generosite" || page === "all") {
      const generosityRate = currentRevenue > 0
        ? (currentDiscount / (currentRevenue + currentDiscount)) * 100
        : 0

      if (generosityRate > 20) {
        insights.push({
          id: "generosite-high",
          title: `Taux de générosité élevé : ${generosityRate.toFixed(1)}%`,
          description: `Le taux dépasse la cible de 20%. Revoyez les codes promo actifs et les prix barrés pour identifier les leviers de réduction.`,
          severity: "warning",
          category: "generosite",
          page: "generosite",
        })
      } else if (generosityRate > 0 && generosityRate <= 18) {
        insights.push({
          id: "generosite-ok",
          title: `Générosité maîtrisée : ${generosityRate.toFixed(1)}%`,
          description: `Bon contrôle des remises — en dessous de la cible de 20%. Marge de manoeuvre pour des opérations ciblées.`,
          severity: "success",
          category: "generosite",
          page: "generosite",
        })
      }
    }

    // ── Influence insights ──
    if (page === "influencers" || page === "all") {
      const { data: influenceData } = await supabase
        .from("influencer_product_sales")
        .select("line_price, influencer_id")
        .gte("order_date", `${year}-${String(month).padStart(2, "0")}-01`)
        .lt("order_date", `${year}-${String(month + 1 > 12 ? 1 : month + 1).padStart(2, "0")}-01`)

      if (influenceData && influenceData.length > 0) {
        const infRevenue = influenceData.reduce((s, r) => s + parseFloat(r.line_price), 0)
        const activeInf = new Set(influenceData.map(r => r.influencer_id)).size
        const infShare = currentRevenue > 0 ? Math.round((infRevenue / currentRevenue) * 100) : 0

        insights.push({
          id: "influence-share",
          title: `Influence = ${infShare}% du CA (${activeInf} influenceurs actifs)`,
          description: `${Math.round(infRevenue).toLocaleString("fr-FR")}€ générés par l'influence ce mois. ${
            infShare > 30 ? "Fort levier — continuer à investir dans les top performers." :
            infShare < 10 ? "Part faible — activez plus de codes influenceurs." : "Bonne contribution."
          }`,
          severity: infShare > 20 ? "success" : "info",
          category: "influence",
          page: "influencers",
        })
      }
    }

    // ── Acquisition insights ──
    if (page === "acquisition" || page === "all") {
      // Check Meta spend
      const { data: metaCache } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `meta_monthly_${year}_${month}`)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metaSummary = (metaCache?.data as any)?.summary || {}
      const metaSpend = parseFloat(metaSummary.spend || "0")
      const metaRoas = parseFloat(metaSummary.roas || "0")

      if (metaSpend > 0) {
        if (metaRoas < 2) {
          insights.push({
            id: "acquisition-meta-roas-low",
            title: `ROAS Meta faible : ${metaRoas.toFixed(1)}x`,
            description: `Pour ${Math.round(metaSpend).toLocaleString("fr-FR")}€ dépensés, le ROAS est sous 2x. Optimisez les audiences et créas les moins performantes.`,
            severity: "warning",
            category: "meta",
            page: "acquisition",
          })
        } else if (metaRoas > 4) {
          insights.push({
            id: "acquisition-meta-roas-high",
            title: `Excellent ROAS Meta : ${metaRoas.toFixed(1)}x`,
            description: `${Math.round(metaSpend).toLocaleString("fr-FR")}€ de budget avec un ROAS de ${metaRoas.toFixed(1)}x. Opportunité d'augmenter le budget pour scaler.`,
            severity: "success",
            category: "meta",
            page: "acquisition",
          })
        }
      }
    }

    return NextResponse.json({ insights, page, generated_at: new Date().toISOString() })
  } catch (error) {
    console.error("Insights API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}
