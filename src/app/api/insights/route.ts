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

    // ── Klaviyo insights (deep order analysis) ──
    if (page === "klaviyo" || page === "all") {
      // Load multiple months for repeat purchase & churn analysis
      const allMonthOrders: any[][] = []
      for (let m = 1; m <= month; m++) {
        const monthOrders = await getOrders(year, m)
        allMonthOrders.push(monthOrders)
      }
      const allOrders = allMonthOrders.flat()

      // ── 1. Repeat purchase rate ──
      const customerOrders: Record<string, { count: number; months: Set<number>; total: number }> = {}
      for (let m = 0; m < allMonthOrders.length; m++) {
        for (const order of allMonthOrders[m]) {
          if (order.cancelled_at) continue
          const email = (order.email || "").toLowerCase().trim()
          if (!email) continue
          if (!customerOrders[email]) {
            customerOrders[email] = { count: 0, months: new Set(), total: 0 }
          }
          customerOrders[email].count += 1
          customerOrders[email].months.add(m + 1)
          customerOrders[email].total += parseFloat(order.total_price || "0")
        }
      }

      const totalCustomers = Object.keys(customerOrders).length
      const repeatCustomers = Object.values(customerOrders).filter((c) => c.count > 1).length
      const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0

      if (totalCustomers > 0) {
        insights.push({
          id: "klaviyo-repeat-rate",
          title: `Taux de réachat ${year} : ${repeatRate}% (${repeatCustomers} clients)`,
          description: repeatRate < 20
            ? `Seulement ${repeatRate}% des clients rachètent. Benchmark e-commerce beauté : 25-35%. Opportunité de flow post-achat + winback à J30/J60.`
            : repeatRate < 30
            ? `${repeatRate}% de réachat, proche du benchmark beauté (25-35%). Un flow post-achat ciblé par produit pourrait pousser à 30%+.`
            : `${repeatRate}% de réachat, au-dessus du benchmark beauté (25-35%). Excellente fidélisation.`,
          severity: repeatRate < 20 ? "warning" : repeatRate < 30 ? "info" : "success",
          category: "retention",
          page: "klaviyo",
        })
      }

      // ── 2. Churn detection (bought prev months, not this month) ──
      const currentMonthEmails = new Set(
        currentOrders.filter((o: any) => !o.cancelled_at).map((o: any) => (o.email || "").toLowerCase().trim()).filter(Boolean)
      )
      const prevMonthEmails = new Set(
        prevOrders.filter((o: any) => !o.cancelled_at).map((o: any) => (o.email || "").toLowerCase().trim()).filter(Boolean)
      )
      const churned = [...prevMonthEmails].filter((e) => !currentMonthEmails.has(e))
      const churnRate = prevMonthEmails.size > 0 ? Math.round((churned.length / prevMonthEmails.size) * 100) : 0

      if (prevMonthEmails.size > 20) {
        insights.push({
          id: "klaviyo-churn",
          title: `${churned.length} clients du mois dernier n'ont pas racheté (${churnRate}%)`,
          description: churnRate > 85
            ? `${churnRate}% de churn mois-sur-mois. Le flow anti-churn ne fonctionne pas assez. Testez un winback plus agressif (offre -15% à J45, reminder à J60).`
            : `${churnRate}% de churn mensuel. C'est normal en beauté (cycle de rachat ~60-90j). Un flow winback à J60 avec offre ciblée peut récupérer 5-10% de ces clients.`,
          severity: churnRate > 85 ? "critical" : "info",
          category: "retention",
          page: "klaviyo",
        })
      }

      // ── 3. Cross-sell patterns (products bought together) ──
      const productPairs: Record<string, { count: number; products: [string, string] }> = {}
      for (const order of allOrders) {
        if (order.cancelled_at) continue
        const items: string[] = (order.line_items || []).map((li: any) => li.title || "").filter(Boolean)
        const uniqueItems: string[] = [...new Set(items)]
        for (let i = 0; i < uniqueItems.length; i++) {
          for (let j = i + 1; j < uniqueItems.length; j++) {
            const key = [uniqueItems[i], uniqueItems[j]].sort().join(" + ")
            if (!productPairs[key]) {
              productPairs[key] = { count: 0, products: [uniqueItems[i], uniqueItems[j]] }
            }
            productPairs[key].count += 1
          }
        }
      }

      const topPairs = Object.values(productPairs)
        .filter((p) => p.count >= 5)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)

      if (topPairs.length > 0) {
        const pair = topPairs[0]
        insights.push({
          id: "klaviyo-crosssell-1",
          title: `Cross-sell : "${pair.products[0]}" + "${pair.products[1]}" (${pair.count} commandes)`,
          description: `Ces 2 produits sont achetés ensemble dans ${pair.count} commandes. Créez un flow post-achat : quand quelqu'un achète l'un, proposer l'autre à J+3.`,
          severity: "info",
          category: "cross-sell",
          page: "klaviyo",
        })

        if (topPairs.length > 1) {
          const pair2 = topPairs[1]
          insights.push({
            id: "klaviyo-crosssell-2",
            title: `Cross-sell #2 : "${pair2.products[0]}" + "${pair2.products[1]}" (${pair2.count}x)`,
            description: `${pair2.count} commandes contiennent ces 2 produits ensemble. Autre opportunité de flow post-achat ciblé.`,
            severity: "info",
            category: "cross-sell",
            page: "klaviyo",
          })
        }
      }

      // ── 4. Single-product orders (upsell opportunity) ──
      const singleItemOrders = currentOrders.filter(
        (o: any) => !o.cancelled_at && (o.line_items || []).length === 1
      )
      const singleItemRate = currentOrders.length > 0
        ? Math.round((singleItemOrders.length / currentOrders.length) * 100)
        : 0

      if (currentOrders.length > 20 && singleItemRate > 40) {
        insights.push({
          id: "klaviyo-single-item",
          title: `${singleItemRate}% des commandes = 1 seul produit`,
          description: `${singleItemOrders.length} commandes sur ${currentOrders.length} ne contiennent qu'un produit. Opportunité d'upsell dans le flow de confirmation : recommander un produit complémentaire.`,
          severity: "warning",
          category: "upsell",
          page: "klaviyo",
        })
      }

      // ── 5. Top product needing a post-purchase flow ──
      const productBuyers: Record<string, { buyers: Set<string>; total: number }> = {}
      for (const order of allOrders) {
        if (order.cancelled_at) continue
        const email = (order.email || "").toLowerCase().trim()
        if (!email) continue
        for (const item of (order.line_items || [])) {
          const title = item.title || ""
          if (!title) continue
          if (!productBuyers[title]) {
            productBuyers[title] = { buyers: new Set(), total: 0 }
          }
          productBuyers[title].buyers.add(email)
          productBuyers[title].total += (item.quantity || 1)
        }
      }

      // Find product with most unique buyers but low repeat rate
      const productStats = Object.entries(productBuyers)
        .map(([title, data]) => {
          const buyers = data.buyers.size
          const repeatBuyers = [...data.buyers].filter((email) => {
            const c = customerOrders[email]
            return c && c.count > 1
          }).length
          const repeatPct = buyers > 0 ? Math.round((repeatBuyers / buyers) * 100) : 0
          return { title, buyers, repeatPct, total: data.total }
        })
        .filter((p) => p.buyers >= 10)
        .sort((a, b) => b.buyers - a.buyers)

      const lowRepeatProduct = productStats.find((p) => p.repeatPct < 20)
      if (lowRepeatProduct) {
        insights.push({
          id: "klaviyo-product-flow",
          title: `"${lowRepeatProduct.title}" : ${lowRepeatProduct.buyers} acheteurs mais ${lowRepeatProduct.repeatPct}% de réachat`,
          description: `Ce produit a beaucoup d'acheteurs uniques mais peu rachètent. Flow post-achat spécifique recommandé : conseils d'utilisation à J+7, cross-sell complémentaire à J+14, offre fidélité à J+30.`,
          severity: "warning",
          category: "retention",
          page: "klaviyo",
        })
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
