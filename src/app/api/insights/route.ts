import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadCodeCategoryMap, computeGenerosite } from "@/lib/generosite"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

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

    // Seuils pilotés par knowledge_base (payloads) — défauts si entrées absentes.
    let genTarget = 20
    let roasAlert = 2
    let roasTarget = 5
    try {
      const { data: kb } = await supabase
        .from("knowledge_base")
        .select("key, payload")
        .in("key", ["strategy:generosite-target", "rule:roas-benchmark"])
      for (const row of kb || []) {
        const p = (row.payload || {}) as Record<string, unknown>
        if (row.key === "strategy:generosite-target") genTarget = Number(p.target_pct) || genTarget
        if (row.key === "rule:roas-benchmark") {
          roasAlert = Number(p.meta_roas_alert) || roasAlert
          roasTarget = Number(p.meta_roas_target) || roasTarget
        }
      }
    } catch {
      /* défauts */
    }

    // Opération promo en cours (calendar_events) — change la lecture de la générosité
    let promoNow: string | null = null
    try {
      const todayStr = now.toISOString().slice(0, 10)
      const { data: promoEvents } = await supabase
        .from("calendar_events")
        .select("title, scheduled_at, metadata")
        .eq("event_type", "promo")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active = (promoEvents || []).filter((e: any) => {
        const start = (e.scheduled_at || "").slice(0, 10)
        const end = ((e.metadata?.end_date as string) || start).slice(0, 10)
        return start <= todayStr && end >= todayStr
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (active.length > 0) promoNow = active.map((e: any) => e.title).join(" + ")
    } catch {
      /* pas de calendrier → lecture standard */
    }

    // Get current and previous month orders
    const currentOrders = await getOrders(year, month)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevOrders = await getOrders(prevYear, prevMonth)

    const currentRevenue = currentOrders.reduce((s: number, o: { total_price?: string }) => s + parseFloat(o.total_price || "0"), 0)
    const prevRevenue = prevOrders.reduce((s: number, o: { total_price?: string }) => s + parseFloat(o.total_price || "0"), 0)
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(year, month, 0).getDate()
    const projectedRevenue = dayOfMonth > 0 ? (currentRevenue / dayOfMonth) * daysInMonth : 0

    // ── Dashboard insights ──
    if (page === "dashboard" || page === "all") {
      // Revenue trend — comparaison à PÉRIMÈTRE ÉGAL : J1→J{n} vs J1→J{n} du mois
      // précédent. Avant : mois partiel vs mois précédent ENTIER → fausse "baisse
      // de 60%" systématique en début de mois.
      const prevMTDRevenue = prevOrders
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((o: any) => new Date(o.created_at || 0).getDate() <= dayOfMonth)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0)
      if (prevMTDRevenue > 0) {
        const revChange = ((currentRevenue - prevMTDRevenue) / prevMTDRevenue) * 100
        if (revChange > 10) {
          insights.push({
            id: "dashboard-rev-up",
            title: `CA en hausse de ${Math.round(revChange)}% vs même période le mois dernier`,
            description: `${Math.round(currentRevenue).toLocaleString("fr-FR")}€ à J${dayOfMonth} vs ${Math.round(prevMTDRevenue).toLocaleString("fr-FR")}€ sur J1→J${dayOfMonth} le mois dernier. Projection fin de mois : ~${Math.round(projectedRevenue).toLocaleString("fr-FR")}€ (mois précédent complet : ${Math.round(prevRevenue).toLocaleString("fr-FR")}€).`,
            severity: "success",
            category: "revenue",
            page: "dashboard",
          })
        } else if (revChange < -10) {
          insights.push({
            id: "dashboard-rev-down",
            title: `CA en baisse de ${Math.round(Math.abs(revChange))}% vs même période le mois dernier`,
            description: `${Math.round(currentRevenue).toLocaleString("fr-FR")}€ à J${dayOfMonth} vs ${Math.round(prevMTDRevenue).toLocaleString("fr-FR")}€ sur J1→J${dayOfMonth} le mois dernier. Projection : ~${Math.round(projectedRevenue).toLocaleString("fr-FR")}€ (mois précédent complet : ${Math.round(prevRevenue).toLocaleString("fr-FR")}€).`,
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
    // Calcul CANONIQUE (computeGenerosite) — même formule que la page /generosite
    // et le générateur. L'ancienne approximation discount/(revenue+discount)
    // ignorait les prix barrés et le SAV → deux chiffres différents dans l'app.
    if (page === "generosite" || page === "all") {
      const categoryMap = await loadCodeCategoryMap()
      const gen = computeGenerosite(currentOrders, categoryMap)
      const generosityRate = gen.generosite_rate

      if (generosityRate > genTarget) {
        insights.push({
          id: "generosite-high",
          title: `Générosité : ${generosityRate.toFixed(1)}% (cible ${genTarget}%)${promoNow ? ` — "${promoNow}" en cours` : ""}`,
          description: promoNow
            ? `Taux au-dessus de la cible pendant une opération planifiée — attendu (prix barrés/remises promo). À suivre : le CA incrémental doit compenser la marge sacrifiée.`
            : `Le taux dépasse la cible de ${genTarget}% (formule canonique : remises + prix barrés − SAV, sur CA brut). Regarder la décomposition par catégorie pour identifier le poste hors influence à réduire.`,
          severity: promoNow ? "info" : "warning",
          category: "generosite",
          page: "generosite",
        })
      } else if (generosityRate > 0 && generosityRate <= genTarget - 2) {
        insights.push({
          id: "generosite-ok",
          title: `Générosité maîtrisée : ${generosityRate.toFixed(1)}%`,
          description: `Bon contrôle des remises — en dessous de la cible de ${genTarget}%. Marge de manoeuvre pour des opérations ciblées.`,
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
        .lt("order_date", `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`)

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
        // Doctrine attribution (knowledge_base) : le ROAS plateforme est DÉCLARATIF
        // (last-click, sur-compte vs codes influence) — l'arbitre honnête = MER.
        const merProxy = currentRevenue > 0 ? currentRevenue / metaSpend : 0
        if (metaRoas < roasAlert) {
          insights.push({
            id: "acquisition-meta-roas-low",
            title: `ROAS Meta faible : ${metaRoas.toFixed(1)}x (seuil ${roasAlert}x)`,
            description: `Pour ${Math.round(metaSpend).toLocaleString("fr-FR")}€ dépensés, le ROAS déclaré est sous ${roasAlert}x. Optimisez les audiences et créas les moins performantes.`,
            severity: "warning",
            category: "meta",
            page: "acquisition",
          })
        } else if (metaRoas >= roasTarget) {
          insights.push({
            id: "acquisition-meta-roas-high",
            title: `ROAS Meta déclaré : ${metaRoas.toFixed(1)}x (cible ${roasTarget}x)`,
            description: `${Math.round(metaSpend).toLocaleString("fr-FR")}€ de budget, ROAS déclaré ${metaRoas.toFixed(1)}x. MER proxy ce mois (CA Shopify ÷ spend Meta) : ${merProxy.toFixed(1)}. Le ROAS plateforme sur-compte (last-click) — valider au MER avant d'augmenter le budget.`,
            severity: "success",
            category: "meta",
            page: "acquisition",
          })
        }
      }
    }

    // ── Meta Ads insights (deep product-level analysis) ──
    if (page === "ads" || page === "all") {
      // Load ads data + product mappings
      const [adsCache, mappingsRes, monthlyCache] = await Promise.all([
        supabase.from("data_cache").select("data").eq("key", `meta_ads_${year}_${month}`).single(),
        supabase.from("ad_product_mappings").select("ad_id, product_title"),
        supabase.from("data_cache").select("data").eq("key", `meta_monthly_${year}_${month}`).single(),
      ])

      const metaAds: Array<{ ad_id: string; ad_name: string; spend: number; purchases: number; roas: number; impressions: number; clicks: number; ctr: number; cpc: number }> = (adsCache.data?.data as any)?.ads || []
      const mappingMap = new Map((mappingsRes.data || []).map((m: any) => [m.ad_id, m.product_title]))
      const metaSummary = (monthlyCache.data?.data as any)?.summary || {}
      const totalSpend = parseFloat(metaSummary.spend || "0")
      const totalPurchases = parseInt(metaSummary.purchases || "0", 10)

      if (metaAds.length > 0 && totalSpend > 0) {
        // ── 1. Aggregate by product ──
        const productPerf: Record<string, { spend: number; purchases: number; revenue: number; impressions: number; clicks: number; adCount: number; ads: Array<{ name: string; spend: number; roas: number; purchases: number }> }> = {}

        for (const ad of metaAds) {
          const product = mappingMap.get(ad.ad_id) || "Non associé"
          if (!productPerf[product]) {
            productPerf[product] = { spend: 0, purchases: 0, revenue: 0, impressions: 0, clicks: 0, adCount: 0, ads: [] }
          }
          productPerf[product].spend += ad.spend
          productPerf[product].purchases += ad.purchases
          productPerf[product].revenue += ad.spend * ad.roas // revenue = spend × roas
          productPerf[product].impressions += ad.impressions
          productPerf[product].clicks += ad.clicks
          productPerf[product].adCount += 1
          productPerf[product].ads.push({ name: ad.ad_name, spend: ad.spend, roas: ad.roas, purchases: ad.purchases })
        }

        const products = Object.entries(productPerf)
          .filter(([name]) => name !== "Non associé")
          .map(([name, data]) => ({
            name,
            ...data,
            roas: data.spend > 0 ? data.revenue / data.spend : 0,
            cpa: data.purchases > 0 ? data.spend / data.purchases : Infinity,
            budgetShare: totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0,
          }))
          .sort((a, b) => b.spend - a.spend)

        // ── 2. Top performing product ──
        const bestRoas = [...products].filter((p) => p.spend > totalSpend * 0.05).sort((a, b) => b.roas - a.roas)[0]
        if (bestRoas && bestRoas.roas > 3) {
          insights.push({
            id: "ads-best-product",
            title: `Top produit : ${bestRoas.name} (ROAS ${bestRoas.roas.toFixed(1)}x)`,
            description: `${Math.round(bestRoas.spend).toLocaleString("fr-FR")}€ investis (${Math.round(bestRoas.budgetShare)}% du budget) → ${bestRoas.purchases} achats. ${
              bestRoas.budgetShare < 30
                ? `Seulement ${Math.round(bestRoas.budgetShare)}% du budget pour le meilleur ROAS — opportunité de scaler ce produit.`
                : `Bonne allocation de budget sur ce top performer.`
            }`,
            severity: "success",
            category: "product-perf",
            page: "ads",
          })
        }

        // ── 3. Scaling opportunity: high ROAS + low budget share ──
        const scalingOpps = products.filter((p) => p.roas > 4 && p.budgetShare < 25 && p.purchases >= 3)
        for (const opp of scalingOpps.slice(0, 2)) {
          if (opp.name === bestRoas?.name) continue // skip if already mentioned
          insights.push({
            id: `ads-scale-${opp.name.replace(/\s/g, "-").toLowerCase()}`,
            title: `Scaling : ${opp.name} — ${opp.roas.toFixed(1)}x ROAS avec ${Math.round(opp.budgetShare)}% du budget`,
            description: `Ce produit performe à ${opp.roas.toFixed(1)}x mais ne reçoit que ${Math.round(opp.budgetShare)}% du budget (${Math.round(opp.spend).toLocaleString("fr-FR")}€). Augmenter le budget pourrait multiplier les ${opp.purchases} achats actuels (ROAS déclaré Meta — valider au MER avant de scaler).`,
            severity: "info",
            category: "scaling",
            page: "ads",
          })
        }

        // ── 4. Worst product: high spend, low ROAS ──
        const worstProduct = [...products].filter((p) => p.spend > totalSpend * 0.1).sort((a, b) => a.roas - b.roas)[0]
        if (worstProduct && worstProduct.roas < 2 && worstProduct.spend > 100) {
          insights.push({
            id: "ads-worst-product",
            title: `${worstProduct.name} : ${Math.round(worstProduct.spend).toLocaleString("fr-FR")}€ dépensés pour seulement ${worstProduct.roas.toFixed(1)}x ROAS`,
            description: `Ce produit représente ${Math.round(worstProduct.budgetShare)}% du budget avec un ROAS faible. ${
              worstProduct.purchases === 0
                ? "Aucun achat — envisagez de couper ces annonces."
                : `CPA de ${Math.round(worstProduct.cpa).toLocaleString("fr-FR")}€ par achat. Testez de nouvelles créas ou réallouez le budget.`
            }`,
            severity: "warning",
            category: "product-perf",
            page: "ads",
          })
        }

        // ── 5. Ads à couper (spend > 50€, 0 achat) ──
        const deadAds = metaAds.filter((ad) => ad.spend > 50 && ad.purchases === 0)
        if (deadAds.length > 0) {
          const deadSpend = deadAds.reduce((s, a) => s + a.spend, 0)
          const topDead = deadAds.sort((a, b) => b.spend - a.spend).slice(0, 3)
          insights.push({
            id: "ads-dead-spend",
            title: `${deadAds.length} annonce(s) sans achat = ${Math.round(deadSpend).toLocaleString("fr-FR")}€ de budget gaspillé`,
            description: `${topDead.map((a) => `"${a.ad_name.substring(0, 30)}…" (${Math.round(a.spend)}€)`).join(", ")}. Ces créas génèrent des impressions mais aucune conversion. Coupez-les ou testez un nouveau visuel.`,
            severity: "critical",
            category: "waste",
            page: "ads",
          })
        }

        // ── 6. Creative spread: same product, big ROAS difference between ads ──
        for (const product of products.slice(0, 5)) {
          if (product.adCount < 2) continue
          const adsWithSpend = product.ads.filter((a) => a.spend > 20)
          if (adsWithSpend.length < 2) continue

          const roasValues = adsWithSpend.map((a) => a.roas)
          const maxRoas = Math.max(...roasValues)
          const minRoas = Math.min(...roasValues)

          if (maxRoas > 3 && minRoas < 1.5 && maxRoas - minRoas > 3) {
            const bestAd = adsWithSpend.find((a) => a.roas === maxRoas)
            const worstAd = adsWithSpend.find((a) => a.roas === minRoas)
            insights.push({
              id: `ads-spread-${product.name.replace(/\s/g, "-").toLowerCase()}`,
              title: `${product.name} : écart créatif — ROAS de ${minRoas.toFixed(1)}x à ${maxRoas.toFixed(1)}x`,
              description: `La meilleure créa fait ${maxRoas.toFixed(1)}x ROAS${bestAd ? ` ("${bestAd.name.substring(0, 25)}…")` : ""} vs ${minRoas.toFixed(1)}x pour la pire${worstAd ? ` ("${worstAd.name.substring(0, 25)}…")` : ""}. Coupez les mauvaises créas et dupliquez le format gagnant.`,
              severity: "warning",
              category: "creative",
              page: "ads",
            })
            break // only show 1 spread insight
          }
        }

        // ── 7. CPA vs AOV analysis ──
        const currentAOV = currentOrders.length > 0 ? currentRevenue / currentOrders.length : 0
        if (currentAOV > 0) {
          const globalCPA = totalPurchases > 0 ? totalSpend / totalPurchases : 0
          if (globalCPA > currentAOV * 0.5) {
            insights.push({
              id: "ads-cpa-vs-aov",
              title: `CPA Meta (${Math.round(globalCPA)}€) vs Panier moyen (${Math.round(currentAOV)}€)`,
              description: globalCPA > currentAOV
                ? `Le CPA dépasse le panier moyen — chaque acquisition coûte plus qu'elle ne rapporte en première commande. Réduisez le CPA ou augmentez le panier moyen (bundles, upsell).`
                : `CPA à ${Math.round((globalCPA / currentAOV) * 100)}% du panier moyen. ${
                  globalCPA > currentAOV * 0.7
                    ? "Marge serrée — optimisez les audiences ou augmentez l'AOV."
                    : "Ratio sain mais surveillez l'évolution."
                }`,
              severity: globalCPA > currentAOV ? "critical" : globalCPA > currentAOV * 0.7 ? "warning" : "info",
              category: "profitability",
              page: "ads",
            })
          }
        }

        // ── 8. Budget concentration analysis ──
        if (products.length >= 3) {
          const topProduct = products[0]
          if (topProduct.budgetShare > 70) {
            insights.push({
              id: "ads-concentration",
              title: `${Math.round(topProduct.budgetShare)}% du budget concentré sur ${topProduct.name}`,
              description: `Risque de dépendance à un seul produit. Si ce produit sature (fatigue d'audience), le ROAS global chutera. Diversifiez avec des tests sur ${products[1]?.name || "d'autres produits"}.`,
              severity: "warning",
              category: "strategy",
              page: "ads",
            })
          }
        }

        // ── 9. Unmapped ads (can't analyze product perf without mappings) ──
        const unmappedCount = metaAds.filter((ad) => !mappingMap.has(ad.ad_id)).length
        if (unmappedCount > 3) {
          insights.push({
            id: "ads-unmapped",
            title: `${unmappedCount} annonces non associées à un produit`,
            description: `Cliquez "Associer produits" pour lier ces annonces. Sans association, l'analyse par produit est incomplète.`,
            severity: "info",
            category: "setup",
            page: "ads",
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
