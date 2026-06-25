import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadCodeCategoryMap, computeGenerosite } from "@/lib/generosite"
import { CODE_TYPE_LABELS } from "@/lib/codes"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─── Types ──────────────────────────────────────────────────────

type NewOpp = {
  title: string
  description: string
  category: string
  impact: "high" | "medium" | "low"
  prompt: string
}

type Weights = {
  category_scores?: Record<string, { sum: number; count: number }>
}

// ─── Helpers ────────────────────────────────────────────────────

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function parseOrders(data: any): any[] {
  if (!data?.orders) return []
  return data.orders as any[]
}

async function loadOrders(year: number, month: number): Promise<any[]> {
  const { data } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", `shopify_orders_${year}_${month}`)
    .single()
  return parseOrders(data?.data)
}

function monthOffset(year: number, month: number, back: number): { year: number; month: number } {
  const d = new Date(year, month - 1, 1)
  d.setMonth(d.getMonth() - back)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

// How eagerly to generate opps for a category.
// avg score ≥ 8 → multiply thresholds by 1.4 (generate more freely)
// avg score ≤ 3 → multiply by 0.6 (only strong signals trigger)
function eagerness(weights: Weights, category: string): number {
  const s = weights.category_scores?.[category]
  if (!s || s.count < 3) return 1.0
  const avg = s.sum / s.count
  if (avg >= 8) return 1.4
  if (avg >= 6) return 1.2
  if (avg <= 3) return 0.6
  return 1.0
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

// ─── Ad name parsing ─────────────────────────────────────────────

// Ordered most-specific first — first match wins.
const PRODUCT_PATTERNS: [RegExp, string][] = [
  [/hair\s?force\s?cap|hair\s?cap/i, "Hair Force Cap"],
  [/led\s?mask|masque\s?led/i, "LED Mask"],
  [/brume|vit\.?\s?c|vitamine\s?c/i, "Brume Vitamine C"],
  [/patch|eye[\s-]?patch|patch[\s-]?yeux/i, "Patch Yeux"],
  [/TC7\+?/i, "TC7+"],
  [/hair/i, "Hair Force Cap"],
]

const CREATIVE_PATTERNS: [RegExp, string][] = [
  [/ugc/i, "UGC"],
  [/t[eé]moignage|review|avis\s?(client|réel|vérifié)?/i, "Témoignage"],
  [/avant[\s\-]?apr[eè]s|before[\s\-]?after|b\/a/i, "Avant\/Après"],
  [/tuto(riel)?/i, "Tutoriel"],
  [/r[eé]el/i, "Réel"],
  [/storie?s?/i, "Story"],
  [/carousel|carrousel|carrou/i, "Carrousel"],
  [/vid[eé]o/i, "Vidéo"],
  [/image|photo|static|statique/i, "Image statique"],
  [/catalogue/i, "Catalogue"],
]

function extractProduct(adName: string): string | null {
  for (const [re, label] of PRODUCT_PATTERNS) if (re.test(adName)) return label
  return null
}

function extractCreativeType(adName: string): string | null {
  for (const [re, label] of CREATIVE_PATTERNS) if (re.test(adName)) return label
  return null
}

function adSummary(a: { ad_name: string; spend: number; roas: number }): string {
  const product = extractProduct(a.ad_name)
  const crea = extractCreativeType(a.ad_name)
  const tags = [product, crea].filter(Boolean).join(" · ")
  return tags ? `${a.ad_name} [${tags}]` : a.ad_name
}

// ─── Main ───────────────────────────────────────────────────────

export async function GET() {
  const findings: string[] = []
  const newOpportunities: NewOpp[] = []

  try {
    const now = new Date()
    // Analyse le DERNIER MOIS COMPLET (jamais le mois en cours : 1–2 jours de data
    // donnent des ratios absurdes — générosité 44%, rétention 4%).
    const ref = monthOffset(now.getFullYear(), now.getMonth() + 1, 1)
    const year = ref.year
    const month = ref.month
    const prev = monthOffset(year, month, 1)

    // ── 0. LOAD WEIGHTS (learning loop) ──
    const { data: weightsCache } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", "companion_weights")
      .single()
    const weights: Weights = (weightsCache?.data as Weights) || {}

    // ── 1. DATA FRESHNESS CHECK ──
    const { data: cronSync } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", "last_cron_sync")
      .single()

    if (cronSync?.data?.ran_at) {
      const hoursSince = (now.getTime() - new Date(cronSync.data.ran_at as string).getTime()) / 3600000
      findings.push(
        hoursSince > 48
          ? `ALERTE: Dernier cron sync il y a ${Math.round(hoursSince)}h (devrait être <24h)`
          : `Cron sync OK (il y a ${Math.round(hoursSince)}h)`
      )
    } else {
      findings.push("ALERTE: Aucun cron sync trouvé")
    }

    // ── 2. ORDERS — dernier mois complet vs précédent ──
    const current = await loadOrders(year, month)
    const previous = await loadOrders(prev.year, prev.month)

    findings.push(`Mois analysé : ${year}-${String(month).padStart(2, "0")} (dernier mois complet)`)

    if (current.length < 20) {
      findings.push(`Seulement ${current.length} commandes — analyse ignorée (données insuffisantes).`)
      return NextResponse.json({
        success: true,
        analyzed_at: now.toISOString(),
        period: `${year}-${String(month).padStart(2, "0")}`,
        skipped: true,
        summary: { orders: current.length, opportunities_created: 0 },
        findings,
      })
    }

    const currentRevenue = current.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
    const previousRevenue = previous.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
    const currentAOV = current.length > 0 ? currentRevenue / current.length : 0
    const previousAOV = previous.length > 0 ? previousRevenue / previous.length : 0

    const revenueDelta = pctChange(currentRevenue, previousRevenue)
    const ordersDelta = pctChange(current.length, previous.length)
    const aovDelta = pctChange(currentAOV, previousAOV)

    findings.push(`Revenue: ${Math.round(currentRevenue)}€ (${revenueDelta > 0 ? "+" : ""}${revenueDelta}%)`)
    findings.push(`Commandes: ${current.length} (${ordersDelta > 0 ? "+" : ""}${ordersDelta}%)`)
    findings.push(`AOV: ${Math.round(currentAOV)}€ (${aovDelta > 0 ? "+" : ""}${aovDelta}%)`)

    if (revenueDelta < -10) {
      newOpportunities.push({
        title: `Baisse revenue ${revenueDelta}%`,
        description: `Le CA est passé de ${Math.round(previousRevenue)}€ à ${Math.round(currentRevenue)}€ (${revenueDelta}%). Diagnostiquer : trafic, conversion ou panier moyen.`,
        category: "shopify",
        impact: "high",
        prompt: `Le CA a baissé de ${Math.abs(revenueDelta)}% sur ${year}-${month} vs le mois précédent. Aide-moi à diagnostiquer : trafic, conversion ou panier moyen ? Vérifie Shopify et Meta Ads.`,
      })
    }

    // ── 3. RÉTENTION — clients revenants sur 3 mois glissants ──
    const trailing = await Promise.all(
      [1, 2, 3].map((b) => {
        const m = monthOffset(year, month, b)
        return loadOrders(m.year, m.month)
      })
    )
    const emailsOf = (orders: any[]) =>
      new Set(orders.map((o) => (o.email || "").toLowerCase()).filter(Boolean))
    const currentEmails = emailsOf(current)
    const priorEmails = new Set<string>()
    for (const months of trailing) for (const e of emailsOf(months)) priorEmails.add(e)

    let returning = 0
    for (const e of currentEmails) if (priorEmails.has(e)) returning++
    const returningRate =
      currentEmails.size > 0 ? Math.round((returning / currentEmails.size) * 1000) / 10 : 0

    findings.push(`Clients revenants (3 mois glissants) : ${returningRate}% (${returning}/${currentEmails.size})`)

    const retentionThreshold = 15 * eagerness(weights, "retention")
    if (returningRate < retentionThreshold && currentEmails.size > 50) {
      newOpportunities.push({
        title: `Clients revenants à ${returningRate}%`,
        description: `${returning} clients sur ${currentEmails.size} avaient déjà acheté dans les 3 mois précédents. Levier : flows post-achat Klaviyo (TC7+/Hair Cap/LED Mask) + winback.`,
        category: "retention",
        impact: "medium",
        prompt: `Mon taux de clients revenants (3 mois) est à ${returningRate}% (${returning}/${currentEmails.size}). Aide-moi à le monter via les flows Klaviyo post-achat (appareils) et un winback, sans réduire l'acquisition influence.`,
      })
    }

    // ── 4. GÉNÉROSITÉ ──
    const codeMap = await loadCodeCategoryMap()
    const gen = computeGenerosite(current, codeMap)
    const pct = (amount: number) => (gen.ca_brut > 0 ? Math.round((amount / gen.ca_brut) * 1000) / 10 : 0)
    const influencePct = pct(gen.by_category.influencer?.discount || 0)

    findings.push(`Générosité : ${gen.generosite_rate}% (cible 20%, SAV exclu, influence incluse)`)

    if (gen.generosite_rate > 20) {
      const drivers = Object.entries(gen.by_category)
        .filter(([t]) => t !== "influencer" && t !== "service_client")
        .map(([t, v]) => ({ label: CODE_TYPE_LABELS[t] || t, pct: pct(v.discount) }))
        .sort((a, b) => b.pct - a.pct)
      const top = drivers[0]
      const driverTxt = top ? `${top.label} (${top.pct}%)` : "remises automatiques"

      newOpportunities.push({
        title: `Générosité à ${gen.generosite_rate}% (cible 20%)`,
        description: `Générosité ${gen.generosite_rate}% (SAV exclu). Principal poste hors influence : ${driverTxt}. L'influence (${influencePct}%) est stratégique — ne PAS y toucher.`,
        category: "generosite",
        impact: gen.generosite_rate > 30 ? "high" : "medium",
        prompt: `Ma générosité est à ${gen.generosite_rate}% vs cible 20% (codes influenceurs INCLUS mais stratégiques et à NE PAS couper ; SAV exclu). Le principal poste hors influence est ${driverTxt}. Aide-moi à réduire la générosité non-influence (remises automatiques/volume, dotations) sans jamais toucher aux codes influenceurs.`,
      })
    }

    // ── 5. META ADS — ROAS + dead ads + corrélation produit bestseller ──
    const { data: metaData } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `meta_ads_${year}_${month}`)
      .single()

    if (metaData?.data?.ads) {
      const ads = metaData.data.ads as { ad_name: string; spend: number; roas: number; purchases: number }[]
      const totalSpend = ads.reduce((s, a) => s + a.spend, 0)
      const totalPurchases = ads.reduce((s, a) => s + a.purchases, 0)
      const overallROAS = totalSpend > 0 ? Math.round((ads.reduce((s, a) => s + a.spend * a.roas, 0) / totalSpend) * 10) / 10 : 0

      findings.push(`Meta Ads: ${Math.round(totalSpend)}€ spend, ${totalPurchases} purchases, ROAS ${overallROAS}`)

      // 5a. DEAD ADS — enrichis avec produit + type de créa extraits du nom
      const deadThreshold = 50 / eagerness(weights, "meta_ads")
      const deadAds = ads.filter((a) => a.spend > deadThreshold && a.purchases === 0)
      if (deadAds.length > 0) {
        const deadNames = deadAds
          .map((a) => `${adSummary(a)} (${Math.round(a.spend)}€)`)
          .join(", ")
        const deadSpend = Math.round(deadAds.reduce((s, a) => s + a.spend, 0))
        findings.push(`Dead ads: ${deadAds.length} ads, ${deadSpend}€ gaspillés`)
        newOpportunities.push({
          title: `${deadAds.length} ads Meta à 0 achats (${deadSpend}€)`,
          description: `Ces ads dépensent sans convertir : ${deadNames}. Couper ou réoptimiser la créa.`,
          category: "meta_ads",
          impact: deadSpend > 200 ? "high" : "medium",
          prompt: `J'ai ${deadAds.length} ads Meta qui dépensent ${deadSpend}€ sans aucun achat : ${deadNames}. Aide-moi à décider lesquelles couper et lesquelles tester avec une nouvelle créa (format, angle, hook différent).`,
        })
      }

      // 5b. CORRÉLATION PRODUIT : ROAS Meta vs rang bestseller Shopify
      // → répond à la question "est-ce qu'on promeut nos vrais bestsellers ?"

      // Agréger Meta spend/ROAS par produit (extrait du nom de l'ad)
      type MetaProd = { spend: number; weightedROAS: number; adNames: string[] }
      const metaByProduct: Record<string, MetaProd> = {}
      for (const a of ads) {
        const p = extractProduct(a.ad_name)
        if (!p || a.spend < 10) continue
        if (!metaByProduct[p]) metaByProduct[p] = { spend: 0, weightedROAS: 0, adNames: [] }
        metaByProduct[p].spend += a.spend
        metaByProduct[p].weightedROAS += a.spend * a.roas
        metaByProduct[p].adNames.push(a.ad_name)
      }

      // Agréger ventes Shopify par produit (même extracteur sur le titre de ligne)
      type ShopifyProd = { units: number; revenue: number }
      const shopifyByProduct: Record<string, ShopifyProd> = {}
      for (const o of current) {
        for (const item of (o.line_items || []) as { title?: string; quantity?: number; price?: string }[]) {
          const p = extractProduct(item.title || "")
          if (!p) continue
          if (!shopifyByProduct[p]) shopifyByProduct[p] = { units: 0, revenue: 0 }
          shopifyByProduct[p].units += Number(item.quantity) || 1
          shopifyByProduct[p].revenue += parseFloat(item.price || "0") * (Number(item.quantity) || 1)
        }
      }

      // Rang bestseller (par CA Shopify)
      const shopifyRanked = Object.entries(shopifyByProduct)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .map(([product], idx) => ({ product, rank: idx + 1 }))
      const rankOf = (p: string) => shopifyRanked.find((r) => r.product === p)?.rank ?? null

      // Table de corrélation pour findings
      const correlTable = Object.entries(metaByProduct)
        .filter(([, m]) => m.spend > 80)
        .map(([product, m]) => {
          const roas = Math.round((m.weightedROAS / m.spend) * 10) / 10
          const shopify = shopifyByProduct[product] || { units: 0, revenue: 0 }
          const rank = rankOf(product)
          return { product, spend: Math.round(m.spend), roas, shopifyRevenue: Math.round(shopify.revenue), rank }
        })
        .sort((a, b) => b.spend - a.spend)

      if (correlTable.length > 0) {
        findings.push(
          "Corrélation Meta vs Shopify : " +
            correlTable
              .map((c) => `${c.product} (${c.spend}€ ads, ROAS ${c.roas}x, rang Shopify #${c.rank ?? "?"})`)
              .join(" | ")
        )

        // Signal 1 : fort spend sur un produit non-bestseller avec mauvais ROAS
        const poorBet = correlTable.find((c) => c.roas < 3.5 && c.rank !== null && c.rank > 3)
        if (poorBet) {
          const bestAlt = correlTable.find((c) => c !== poorBet && c.roas > poorBet.roas && (c.rank ?? 99) < (poorBet.rank ?? 99))
          const altTxt = bestAlt ? ` À comparer : ${bestAlt.product} = ROAS ${bestAlt.roas}x, rang #${bestAlt.rank}.` : ""
          newOpportunities.push({
            title: `Budget Meta mal aligné : ${poorBet.product} ROAS ${poorBet.roas}x (#${poorBet.rank} bestseller)`,
            description: `${poorBet.spend}€ dépensés sur le ${poorBet.product} ce mois pour un ROAS ${poorBet.roas}x, alors qu'il n'est que #${poorBet.rank} des ventes Shopify.${altTxt} Ce budget serait plus rentable sur un produit qui convertit naturellement.`,
            category: "meta_ads",
            impact: "high",
            prompt: `Je dépense ${poorBet.spend}€ en ads Meta sur le ${poorBet.product} (ROAS ${poorBet.roas}x) mais ce produit n'est que #${poorBet.rank} bestseller Shopify ce mois (${poorBet.shopifyRevenue}€ de CA).${altTxt} Aide-moi à décider : couper ce budget ? Changer la créa ? Ou ce produit a-t-il besoin de plus de push publicitaire pour décoller ?`,
          })
        }

        // Signal 2 : bon ROAS + bestseller Shopify mais sous-investi (< 25% du spend total)
        const goodBet = correlTable.find(
          (c) => c.roas >= 5 && c.rank !== null && c.rank <= 2 && c.spend < totalSpend * 0.25
        )
        if (goodBet) {
          newOpportunities.push({
            title: `Sous-investir sur le ${goodBet.product} : ROAS ${goodBet.roas}x et #${goodBet.rank} bestseller`,
            description: `Le ${goodBet.product} cumule ROAS ${goodBet.roas}x ET rang #${goodBet.rank} sur Shopify, mais ne reçoit que ${goodBet.spend}€ (${Math.round((goodBet.spend / totalSpend) * 100)}% du budget Meta). Augmenter le budget ici est le levier le plus sûr.`,
            category: "meta_ads",
            impact: "high",
            prompt: `Mon meilleur combo ce mois : ${goodBet.product} = ROAS ${goodBet.roas}x en ads ET #${goodBet.rank} bestseller Shopify (${goodBet.shopifyRevenue}€ de CA). Pourtant je n'y mets que ${goodBet.spend}€ (${Math.round((goodBet.spend / totalSpend) * 100)}% du budget). Combien devrais-je y allouer ? Quelles créas scaler ?`,
          })
        }

        // Signal 3 : top-3 Shopify sans aucune ad Meta ce mois
        const top3WithoutAds = shopifyRanked
          .filter((r) => r.rank <= 3 && !metaByProduct[r.product])
          .slice(0, 1)
        for (const { product, rank } of top3WithoutAds) {
          const rev = shopifyByProduct[product]?.revenue || 0
          newOpportunities.push({
            title: `${product} : #${rank} bestseller sans aucune pub Meta ce mois`,
            description: `Le ${product} génère ${Math.round(rev)}€ de CA Shopify (rang #${rank}) sans aucune dépense pub Meta. Cette demande organique est un signal fort — des ads pourraient l'amplifier.`,
            category: "meta_ads",
            impact: "medium",
            prompt: `Le ${product} est mon #${rank} bestseller Shopify ce mois (${Math.round(rev)}€) sans aucune pub Meta. Comment tester une première campagne ? Quelle créa, quel objectif, quel budget de test pour valider le ROAS avant de scaler ?`,
          })
        }
      }

      // 5c. TYPE DE CRÉA — quel format performe le mieux par produit
      type CreaPerf = { spend: number; weightedROAS: number; products: Set<string> }
      const byCreativeType: Record<string, CreaPerf> = {}
      for (const a of ads) {
        if (a.spend < 20 || a.purchases === 0) continue
        const crea = extractCreativeType(a.ad_name) || "Autre"
        const product = extractProduct(a.ad_name)
        if (!byCreativeType[crea]) byCreativeType[crea] = { spend: 0, weightedROAS: 0, products: new Set() }
        byCreativeType[crea].spend += a.spend
        byCreativeType[crea].weightedROAS += a.spend * a.roas
        if (product) byCreativeType[crea].products.add(product)
      }

      const creativeRanked = Object.entries(byCreativeType)
        .filter(([, v]) => v.spend > 100)
        .map(([type, v]) => ({
          type,
          roas: Math.round((v.weightedROAS / v.spend) * 10) / 10,
          products: [...v.products],
          spend: Math.round(v.spend),
        }))
        .sort((a, b) => b.roas - a.roas)

      if (creativeRanked.length > 1) {
        findings.push(
          "Types de créa (ROAS moyen) : " +
            creativeRanked.map((c) => `${c.type} ${c.roas}x (${c.products.join("/")})`).join(" | ")
        )

        const best = creativeRanked[0]
        const worst = creativeRanked[creativeRanked.length - 1]

        // Les produits qui n'ont pas encore de créas du type gagnant
        const allProducts = ["TC7+", "LED Mask", "Hair Force Cap", "Brume Vitamine C"]
        const missingBestCrea = allProducts.filter((p) => !best.products.includes(p))

        if (best.roas - worst.roas > 2 && missingBestCrea.length > 0) {
          newOpportunities.push({
            title: `Créa "${best.type}" = ROAS ${best.roas}x — l'étendre au ${missingBestCrea[0]}`,
            description: `Tes meilleures créas ce mois sont les "${best.type}" sur ${best.products.join(", ")} (ROAS ${best.roas}x vs ${worst.roas}x pour les "${worst.type}"). Le ${missingBestCrea[0]} n'a pas encore de créa de ce type.`,
            category: "meta_ads",
            impact: "medium",
            prompt: `Mes meilleures créas Meta ce mois sont de type "${best.type}" sur ${best.products.join(", ")} (ROAS moyen ${best.roas}x). Le format "${worst.type}" ne fait que ${worst.roas}x. Le ${missingBestCrea[0]} n'a pas encore de "${best.type}". Aide-moi à briefer une créa "${best.type}" pour le ${missingBestCrea[0]} : angle, format, durée, points à montrer, hook d'accroche.`,
          })
        }
      }

      // 5d. ROAS GLOBAL — alerte seulement si sous le seuil de rentabilité
      const { data: prevMetaMonthly } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `meta_monthly_${prev.year}_${prev.month}`)
        .single()

      if (prevMetaMonthly?.data?.summary?.roas) {
        const prevROAS = prevMetaMonthly.data.summary.roas as number
        const roasDelta = pctChange(overallROAS, prevROAS)
        findings.push(`ROAS trend: ${prevROAS} → ${overallROAS} (${roasDelta > 0 ? "+" : ""}${roasDelta}%)`)

        const ROAS_FLOOR = 3.5 * eagerness(weights, "meta_ads")
        if (overallROAS < ROAS_FLOOR) {
          const culprits = ads
            .filter((a) => a.spend > 80 && a.roas < overallROAS * 0.8 && a.purchases > 0)
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 3)

          const culpritTxt = culprits.length > 0
            ? culprits.map((a) => `${adSummary(a)} (${Math.round(a.spend)}€ / ROAS ${a.roas.toFixed(1)}x)`).join(", ")
            : null

          newOpportunities.push({
            title: `ROAS Meta à ${overallROAS}x — sous le seuil de rentabilité`,
            description: `ROAS global ${overallROAS}x (était ${prevROAS}x le mois dernier, cible >3.5x).${culpritTxt ? ` Ads qui plombent la moyenne : ${culpritTxt}.` : ""}`,
            category: "meta_ads",
            impact: overallROAS < 2 ? "high" : "medium",
            prompt: `Mon ROAS Meta est à ${overallROAS}x ce mois (était ${prevROAS}x).${culpritTxt ? ` Les ads qui tirent la moyenne vers le bas : ${culpritTxt}.` : ""} Aide-moi à décider quoi couper ou réoptimiser pour repasser au-dessus de 3.5x.`,
          })
        }
      }
    } else {
      findings.push("Meta Ads: pas de données pour ce mois")
    }

    // ── 6. INFLUENCEURS NOMMÉS ──
    try {
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
      const nextM = monthOffset(year, month, -1)
      const monthEnd = `${nextM.year}-${String(nextM.month).padStart(2, "0")}-01`
      const prevMonthStart = `${prev.year}-${String(prev.month).padStart(2, "0")}-01`

      const [{ data: currentSales }, { data: prevSales }] = await Promise.all([
        supabase
          .from("influencer_product_sales")
          .select("influencer_id, line_price, product_title")
          .gte("order_date", monthStart)
          .lt("order_date", monthEnd),
        supabase
          .from("influencer_product_sales")
          .select("influencer_id")
          .gte("order_date", prevMonthStart)
          .lt("order_date", monthStart),
      ])

      const allInflIds = [
        ...(currentSales || []).map((s) => s.influencer_id),
        ...(prevSales || []).map((s) => s.influencer_id),
      ].filter(Boolean)

      if (allInflIds.length > 0) {
        const { data: influencers } = await supabase
          .from("influencers")
          .select("id, name")
          .in("id", [...new Set(allInflIds)])

        const nameById = Object.fromEntries((influencers || []).map((i) => [i.id, i.name as string]))

        // Group current month sales by influencer
        type InflSummary = { revenue: number; products: Set<string> }
        const currentByInfl: Record<string, InflSummary> = {}
        for (const s of currentSales || []) {
          if (!s.influencer_id) continue
          if (!currentByInfl[s.influencer_id]) {
            currentByInfl[s.influencer_id] = { revenue: 0, products: new Set() }
          }
          currentByInfl[s.influencer_id].revenue += Number(s.line_price) || 0
          if (s.product_title) {
            // Normalize: take first segment before " - " (removes variant info)
            const norm = (s.product_title as string).split(" - ")[0].trim()
            currentByInfl[s.influencer_id].products.add(norm)
          }
        }

        // Dormant influencers: had sales last month, none this month
        const prevInflIds = new Set((prevSales || []).map((s) => s.influencer_id))
        const currentInflIds = new Set(Object.keys(currentByInfl))
        const dormantNames = [...prevInflIds]
          .filter((id) => !currentInflIds.has(id) && nameById[id])
          .map((id) => nameById[id])
          .filter(Boolean)
          .slice(0, 4)

        if (dormantNames.length >= 2) {
          const names = dormantNames.join(", ")
          newOpportunities.push({
            title: `Réactiver ${dormantNames.length} influenceuses dormantes`,
            description: `${names} avaient des ventes en ${MONTHS_FR[prev.month - 1]} mais aucune ce mois-ci. Relancer avec un nouveau brief ou un produit à tester.`,
            category: "influence",
            impact: "medium",
            prompt: `Ces influenceuses avaient des ventes le mois dernier mais pas ce mois-ci : ${names}. Aide-moi à les relancer : nouveau produit à pitcher ? Brief rafraîchi ? Timing idéal ?`,
          })
          findings.push(`Influence dormantes : ${names}`)
        }

        // Top influencer selling only 1 product → cross-sell opportunity
        const TALIKA_PRODUCTS = ["TC7+", "LED Mask", "Hair Force Cap", "Hair Cap", "Brume"]
        const topInfluencers = Object.entries(currentByInfl)
          .filter(([id]) => nameById[id])
          .sort(([, a], [, b]) => b.revenue - a.revenue)

        for (const [id, data] of topInfluencers) {
          const name = nameById[id]
          const products = [...data.products]
          if (products.length === 1) {
            const sold = products[0]
            const other = TALIKA_PRODUCTS.find(
              (p) => !sold.toLowerCase().includes(p.toLowerCase().replace("+", "").trim().split(" ")[0])
            )
            if (other) {
              newOpportunities.push({
                title: `Cross-sell : proposer le ${other} à ${name}`,
                description: `${name} génère ${Math.round(data.revenue)}€ uniquement sur ${sold}. Lui proposer le ${other} pour diversifier son contenu et nos ventes.`,
                category: "influence",
                impact: "low",
                prompt: `L'influenceuse ${name} vend uniquement le ${sold} (${Math.round(data.revenue)}€ ce mois). Aide-moi à la pitcher sur le ${other} : quels arguments, quel angle créatif, quelle offre lui proposer ?`,
              })
              break // 1 cross-sell par run
            }
          }
        }
      }
    } catch {
      findings.push("Influence: analyse des noms ignorée (erreur)")
    }

    // ── 7. MARKETING GRATUIT ──
    try {
      const e_free = eagerness(weights, "free_marketing")

      // Top products by order frequency
      const productFreq: Record<string, number> = {}
      for (const o of current) {
        for (const item of o.line_items || []) {
          const title = (item.title || "").split(" - ")[0].trim()
          if (title) productFreq[title] = (productFreq[title] || 0) + 1
        }
      }
      const topProductsByFreq = Object.entries(productFreq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }))
      const topProduct = topProductsByFreq[0]

      // Programme de parrainage si base de clients fidèles significative
      const referralThreshold = Math.round(25 / e_free)
      if (returning >= referralThreshold) {
        newOpportunities.push({
          title: `Programme parrainage : activer ${returning} clients fidèles`,
          description: `${returning} clients sont revenus ce mois (taux ${returningRate}%). Un mécanisme "15% pour toi + 15% pour ton amie" peut générer du CA sans aucun budget publicitaire.`,
          category: "free_marketing",
          impact: "medium",
          prompt: `J'ai ${returning} clients revenants ce mois (taux ${returningRate}%). Aide-moi à lancer un programme parrainage Talika : quel mécanisme (code unique vs lien), quelle récompense (% ou produit offert), comment le promouvoir via email/SMS sans budget ?`,
        })
      }

      // UGC activation sur le bestseller
      const ugcThreshold = Math.round(15 / e_free)
      if (topProduct && topProduct.count >= ugcThreshold) {
        newOpportunities.push({
          title: `UGC : activer les avis photo sur le ${topProduct.name}`,
          description: `Le ${topProduct.name} est dans ${topProduct.count} commandes ce mois. Demander aux acheteurs de partager un avis photo/vidéo = contenu gratuit + preuve sociale sans budget.`,
          category: "free_marketing",
          impact: "low",
          prompt: `Le ${topProduct.name} est mon bestseller ce mois (${topProduct.count} commandes). Aide-moi à lancer une campagne UGC : email de demande d'avis, incentive, comment utiliser le contenu récolté (Instagram, fiche produit, pub) ?`,
        })
      }
    } catch {
      findings.push("Marketing gratuit: analyse ignorée (erreur)")
    }

    // ── 8. OPTIMISATION CR ──
    try {
      const e_cr = eagerness(weights, "conversion")

      const singleItemOrders = current.filter((o) => (o.line_items?.length || 0) === 1).length
      const singleItemRate = current.length > 0 ? Math.round((singleItemOrders / current.length) * 100) : 0

      // Count top 2 products for bundle suggestion
      const topTwo: string[] = []
      const productFreq2: Record<string, number> = {}
      for (const o of current) {
        for (const item of o.line_items || []) {
          const t = (item.title || "").split(" - ")[0].trim()
          if (t) productFreq2[t] = (productFreq2[t] || 0) + 1
        }
      }
      topTwo.push(
        ...Object.entries(productFreq2)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 2)
          .map(([n]) => n)
      )

      // Bundle opportunity when most orders are single-product
      const singleThreshold = Math.round(55 / e_cr)
      if (singleItemRate >= singleThreshold && topTwo.length >= 2) {
        newOpportunities.push({
          title: `${singleItemRate}% de commandes mono-produit — créer un bundle`,
          description: `${singleItemRate}% des commandes ce mois n'ont qu'un seul produit (panier moyen ${Math.round(currentAOV)}€). Un bundle ${topTwo[0]} + ${topTwo[1]} à prix réduit augmenterait mécaniquement le panier moyen.`,
          category: "conversion",
          impact: "medium",
          prompt: `${singleItemRate}% de mes commandes ce mois sont mono-produit (AOV ${Math.round(currentAOV)}€). Aide-moi à créer un bundle ${topTwo[0]} + ${topTwo[1]} : quel prix, quelle réduction (%), comment le mettre en avant dans le cart drawer et les fiches produit ?`,
        })
      }

      // AOV threshold optimization (push toward free shipping sweet spot)
      const aovThreshold = 75 * e_cr
      if (currentAOV < aovThreshold) {
        newOpportunities.push({
          title: `Panier moyen à ${Math.round(currentAOV)}€ — optimiser le seuil livraison gratuite`,
          description: `Un panier moyen de ${Math.round(currentAOV)}€ laisse de la marge. Ajuster le seuil de livraison gratuite juste au-dessus de l'AOV actuel pousse mécaniquement les clients à ajouter un produit.`,
          category: "conversion",
          impact: "low",
          prompt: `Mon panier moyen est ${Math.round(currentAOV)}€ ce mois. Aide-moi à analyser le bon seuil de livraison gratuite pour maximiser les ajouts au panier (avec distribution des paniers si possible), et comment l'afficher dans le drawer.`,
        })
      }
    } catch {
      findings.push("Optimisation CR: analyse ignorée (erreur)")
    }

    // ── 9. NOUVEAU CANAL (1 par mois, rotation sur les non-vus) ──
    try {
      const CHANNELS: NewOpp[] = [
        {
          title: "TikTok Shop : lancer un premier produit",
          description: "TikTok Shop permet de vendre directement depuis la vidéo. TC7+ ou LED Mask — visuels forts, démonstration facile — sont les meilleurs candidats pour un premier test.",
          category: "channels",
          impact: "medium",
          prompt: "Aide-moi à lancer un premier produit Talika sur TikTok Shop. Par quoi commencer ? Format vidéo, ciblage, stratégie d'amorçage, objectif J30 ?",
        },
        {
          title: "B2B Pro : ouvrir le canal instituts et salons",
          description: "Esthéticiennes, instituts et spas = revendeurs potentiels avec de gros paniers. Un compte pro (tarif B2B) peut ouvrir un canal rentable avec peu d'effort initial.",
          category: "channels",
          impact: "medium",
          prompt: "Comment lancer un canal B2B pour Talika ? Quels produits cibler (TC7+, LED Mask), quel pricing, comment contacter les instituts (base de données, approche) ?",
        },
        {
          title: "Relations presse : contacter des journalistes beauté",
          description: "Un placement presse coûte 0€ si bien ciblé. Focus : journalistes tech-beauté et soins du regard (Elle, Cosmopolitan, Vogue, médias digitaux femmes 30-45).",
          category: "channels",
          impact: "low",
          prompt: "Identifie les 5 journalistes ou médias beauté français les plus pertinents pour Talika et propose un pitch personnalisé. Focus : appareils de soin (TC7+, LED Mask, Hair Cap).",
        },
        {
          title: "Programme d'affiliation : lancer sur un réseau partenaire",
          description: "Blogs beauté et comparateurs ont une audience qualifiée et ciblée. Un programme d'affiliation (5-10% commission) peut générer du CA récurrent sans budget publicitaire.",
          category: "channels",
          impact: "medium",
          prompt: "Comment lancer un programme d'affiliation pour Talika ? Quelles plateformes (Awin, Tradedoubler, Impact…), quel taux de commission, comment recruter les bons affiliés ?",
        },
        {
          title: "Newsletter externe : co-publication dans un média beauté",
          description: "Co-publication dans une newsletter beauté existante (Stylist, Cosmopolitan newsletter, Substack beauté). Audience captive, coût nul ou très faible, pas besoin de production.",
          category: "channels",
          impact: "low",
          prompt: "Identifie les newsletters beauté françaises les plus pertinentes pour Talika (abonnées actives, cible féminine 25-45). Comment les approcher pour un placement ou partenariat éditorial ?",
        },
        {
          title: "YouTube organique : série de tutoriels appareils",
          description: "YouTube est le 2e moteur de recherche. Des tutoriels TC7+/LED Mask/Hair Cap génèrent du trafic SEO gratuit et durable. Pas de budget — juste du contenu régulier.",
          category: "channels",
          impact: "medium",
          prompt: "Crée une stratégie de contenu YouTube organique pour Talika : types de vidéos (tuto, before/after, routine), rythme de publication, comment optimiser pour le SEO YouTube ?",
        },
      ]

      // Only add a channel opp if none is currently pending
      const { data: pendingChannel } = await supabase
        .from("opportunities")
        .select("id")
        .eq("category", "channels")
        .eq("status", "pending")
        .limit(1)

      if (!pendingChannel || pendingChannel.length === 0) {
        // Find next unseen channel (not yet in DB at all)
        const { data: seenChannels } = await supabase
          .from("opportunities")
          .select("title")
          .eq("category", "channels")

        const seenTitles = new Set((seenChannels || []).map((c) => c.title.split(":")[0].trim()))
        const nextChannel =
          CHANNELS.find((c) => !seenTitles.has(c.title.split(":")[0].trim())) ||
          CHANNELS[month % CHANNELS.length]

        newOpportunities.push(nextChannel)
        findings.push(`Nouveau canal proposé : ${nextChannel.title.split(":")[0].trim()}`)
      }
    } catch {
      findings.push("Canaux: rotation ignorée (erreur)")
    }

    // ── 10. KLAVIYO — FLOWS STRATÉGIQUES DORMANTS ──
    // Détecte les flows haute valeur encore en DRAFT qui laissent du CA sur la table.
    // Source : cache `klaviyo_flows` rempli par le cron Klaviyo.
    try {
      const { data: klavFlowsCache } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", "klaviyo_flows")
        .single()

      const flows = ((klavFlowsCache?.data as { flows?: { id: string; name: string; status: string }[] })?.flows || [])

      // Browse Abandonment FR en DRAFT = CA perdu chaque mois
      // L'Abandoned Cart (live) génère ~80k€/an ; le Browse Abandonment
      // touche les visiteurs haute valeur AVANT qu'ils ajoutent au panier.
      const browseAbFR = flows.find(
        (f) => /browse.?abandon/i.test(f.name) && /\bfr\b/i.test(f.name)
      )
      if (browseAbFR?.status === "draft") {
        const e_klav_ba = eagerness(weights, "klaviyo")
        if (e_klav_ba >= 0.6) {
          newOpportunities.push({
            title: "Browse Abandonment FR : activer ce flow dormant",
            description:
              "Ce flow capture les visiteurs qui regardent LED Mask (290€) ou Hair Force Cap (490€) sans ajouter au panier. L'Abandoned Cart live génère 80 000€/an — le Browse Abandonment arrive encore plus tôt dans le funnel, sur des produits premium à très haute intention d'achat.",
            category: "klaviyo",
            impact: "high",
            prompt:
              "Le flow Browse Abandonment FR (Klaviyo, ID SY3tSS) est en DRAFT depuis avril 2024. Mon Abandoned Cart live génère ~80 000€/an. Ce flow cible les visiteurs qui ont vu LED Mask (290€) ou Hair Force Cap (490€) sans aller jusqu'au panier. Aide-moi à l'activer : contenu des 2-3 emails, timing (1h / 24h / 72h), angle pour convertir sans discount agressif sur des produits à 290–490€.",
          })
          findings.push("Klaviyo: Browse Abandonment FR toujours en DRAFT")
        }
      }

      // Reconquête clients standard en DRAFT = clients perdus non relancés
      // CHURNER 6 MONTHS (live) ne génère que 519€/an avec 11,7% d'ouverture.
      const reconquete = flows.find(
        (f) => /reconqu/i.test(f.name) && f.status === "draft"
      )
      if (reconquete) {
        newOpportunities.push({
          title: "Reconquête clients : flow DRAFT depuis 9+ mois (à activer)",
          description:
            "Le flow Reconquête des clients est en DRAFT depuis sept. 2025. CHURNER 6 MONTHS (live) ne génère que 519€/an (taux d'ouverture 11,7%). Ces clients inactifs ont payé 177–490€ pour un appareil — ils ont de la valeur à réveiller avec une offre de retour ciblée.",
          category: "klaviyo",
          impact: "medium",
          prompt:
            "Le flow 'Reconquête des clients - Standard' (Klaviyo, ID RLeD26) est en DRAFT depuis septembre 2025. Mon flow CHURNER 6 MONTHS (live) ne génère que 519€/an avec 11,7% d'ouverture. Les clients inactifs 12+ mois ont investi dans un appareil à 177–490€. Aide-moi à écrire un flow reconquête : angle, offre de retour (code promo ? produit offert ? exclusivité ?), nombre d'emails, timing.",
        })
        findings.push("Klaviyo: Reconquête clients en DRAFT depuis sept. 2025")
      }
    } catch {
      findings.push("Klaviyo flows: analyse ignorée (erreur)")
    }

    // ── 11. CUSTOMER JOURNEY — UPSELLS PREMIUM NON ACTIVÉS ──
    // Analyse les 5 derniers mois pour identifier les clients qui ont acheté
    // un appareil mais pas encore son upsell/cross-sell naturel.
    try {
      const trailing5 = await Promise.all(
        [0, 1, 2, 3, 4].map((b) => {
          const m = monthOffset(year, month, b)
          return loadOrders(m.year, m.month)
        })
      )
      const allOrders5 = trailing5.flat()

      if (allOrders5.length > 50) {
        const emailsBoughtTC7 = new Set<string>()
        const emailsBoughtLEDMask = new Set<string>()
        const emailsBoughtHairCap = new Set<string>()
        const emailsBoughtHairSerum = new Set<string>()

        for (const o of allOrders5) {
          const email = (o.email || "").toLowerCase()
          if (!email) continue
          for (const item of (o.line_items || []) as { title?: string }[]) {
            const t = item.title || ""
            if (/TC7\+?/i.test(t)) emailsBoughtTC7.add(email)
            if (/led\s?(?:therapy\s?)?mask|masque\s?led/i.test(t)) emailsBoughtLEDMask.add(email)
            if (/hair\s?force\s?(?:led\s?)?cap|hair\s?(?:led\s?)?cap/i.test(t)) emailsBoughtHairCap.add(email)
            if (/hair\s?force\s?s[eé]rum|s[eé]rum\s?hair/i.test(t)) emailsBoughtHairSerum.add(email)
          }
        }

        // Upsell TC7+ → LED Mask (290€)
        // Data réelle : seuls 8 acheteurs TC7+ sur 5 mois ont aussi acheté LED Mask.
        // Le flow post-achat TC7+ (XFAHEM) est live — on y ajoute l'upsell LED Mask.
        let tc7WithoutLED = 0
        for (const email of emailsBoughtTC7) {
          if (!emailsBoughtLEDMask.has(email)) tc7WithoutLED++
        }
        const tc7Total = emailsBoughtTC7.size

        const e_klav2 = eagerness(weights, "klaviyo")
        if (tc7WithoutLED >= Math.round(30 / e_klav2) && tc7Total > 0) {
          const pct = Math.round((tc7WithoutLED / tc7Total) * 100)
          newOpportunities.push({
            title: `${tc7WithoutLED} acheteurs TC7+ sans LED Mask — upsell 290€ à activer`,
            description: `${pct}% des acheteurs TC7+ (${tc7WithoutLED}/${tc7Total} sur 5 mois) n'ont pas encore le LED Mask (290€). C'est l'upsell premium le plus logique : même cible, même budget, même bénéfice régénération peau. Le flow post-achat TC7+ est live — y ajouter un email upsell LED Mask à J+30.`,
            category: "klaviyo",
            impact: "high",
            prompt: `Sur 5 mois, ${tc7WithoutLED} acheteurs du TC7+ (${pct}%) n'ont pas le LED Mask (290€). Le flow Post-Achat TC7+ (XFAHEM) est live depuis le 24/06. Aide-moi à créer l'email upsell LED Mask : timing (J+30 après TC7+ ?), angle (complémentarité, upgrade routine, résultats boostés), offre (sans remise ou livraison gratuite ?), sujet d'email, structure du contenu.`,
          })
          findings.push(`Customer journey: ${tc7WithoutLED} acheteurs TC7+ sans LED Mask (${pct}%)`)
        }

        // Cross-sell Hair Cap → Sérum (consommable récurrent, 38€)
        let hairCapWithoutSerum = 0
        for (const email of emailsBoughtHairCap) {
          if (!emailsBoughtHairSerum.has(email)) hairCapWithoutSerum++
        }

        if (hairCapWithoutSerum >= 15) {
          newOpportunities.push({
            title: `${hairCapWithoutSerum} acheteurs Hair Cap sans sérum — cross-sell récurrent`,
            description: `${hairCapWithoutSerum} clients du Hair Force Cap n'ont pas encore le Sérum Hair Force (38€, rechargeable). C'est le consommable naturel de l'appareil. Le flow post-achat Hair Cap (SbuN3f) est live — y ajouter un email cross-sell sérum à J+14 = revenu récurrent.`,
            category: "klaviyo",
            impact: "medium",
            prompt: `${hairCapWithoutSerum} acheteurs du Hair Force LED Cap n'ont pas encore le Sérum Hair Force (38€). Le sérum est le consommable naturel de l'appareil. Le flow post-achat Hair Cap (SbuN3f) est live depuis le 24/06. Aide-moi à rédiger l'email cross-sell sérum : timing (J+14 ?), angle (résultats amplifiés avec le sérum), offre bundle, sujet, structure.`,
          })
          findings.push(`Customer journey: ${hairCapWithoutSerum} acheteurs Hair Cap sans sérum`)
        }
      }
    } catch {
      findings.push("Customer journey: analyse ignorée (erreur)")
    }

    // ── 12. INSERT NEW OPPORTUNITIES (dédup par titre, status pending) ──
    let createdCount = 0
    for (const opp of newOpportunities) {
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("status", "pending")
        .ilike("title", `%${opp.title.slice(0, 25)}%`)
        .limit(1)

      if (!existing || existing.length === 0) {
        const { error } = await supabase.from("opportunities").insert({ ...opp, status: "pending" })
        if (!error) createdCount++
      }
    }

    findings.push(
      createdCount > 0
        ? `${createdCount} nouvelle(s) opportunité(s) créée(s)`
        : "Aucune nouvelle opportunité"
    )

    return NextResponse.json({
      success: true,
      analyzed_at: now.toISOString(),
      period: `${year}-${String(month).padStart(2, "0")}`,
      summary: {
        revenue: Math.round(currentRevenue),
        revenue_delta_pct: revenueDelta,
        orders: current.length,
        orders_delta_pct: ordersDelta,
        aov: Math.round(currentAOV),
        returning_rate: returningRate,
        generosite_rate: gen.generosite_rate,
        opportunities_created: createdCount,
      },
      findings,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Analysis failed", findings },
      { status: 500 }
    )
  }
}
