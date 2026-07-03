import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadCodeCategoryMap, computeGenerosite } from "@/lib/generosite"
import { CODE_TYPE_LABELS } from "@/lib/codes"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─── Types ──────────────────────────────────────────────────────

type NewOpp = {
  signal_key: string // clé stable de dédup (indépendante des chiffres du titre)
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
  // "Time Control 7+" = titre produit Shopify réel — sans ce pattern, les line
  // items TC7+ sortaient du rang bestseller et le cross-sell proposait TC7+ à
  // une influenceuse qui ne vend QUE du TC7+.
  [/tc7\+?|time\s?control/i, "TC7+"],
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
        signal_key: "revenue_drop",
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
        signal_key: "retention_low",
        title: `Clients revenants à ${returningRate}%`,
        description: `${returning} clients sur ${currentEmails.size} avaient déjà acheté dans les 3 mois précédents. Levier : flows post-achat Klaviyo (TC7+/Hair Cap/LED Mask) + winback.`,
        category: "retention",
        impact: "medium",
        prompt: `Mon taux de clients revenants (3 mois) est à ${returningRate}% (${returning}/${currentEmails.size}). Aide-moi à le monter via les flows Klaviyo post-achat (appareils) et un winback, sans réduire l'acquisition influence.`,
      })
    }

    // ── 4. GÉNÉROSITÉ (calendar-aware) ──
    // Une générosité haute PENDANT une promo planifiée (soldes…) est un choix,
    // pas une dérive → on ne crie pas au loup, on demande l'arbitrage CA vs marge.
    const codeMap = await loadCodeCategoryMap()
    const gen = computeGenerosite(current, codeMap)
    const pct = (amount: number) => (gen.ca_brut > 0 ? Math.round((amount / gen.ca_brut) * 1000) / 10 : 0)
    const influencePct = pct(gen.by_category.influencer?.discount || 0)

    // Périodes promo du calendrier chevauchant le mois analysé
    const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`
    const nextM4 = monthOffset(year, month, -1)
    const monthEndStr = `${nextM4.year}-${String(nextM4.month).padStart(2, "0")}-01`
    let promoLabel: string | null = null
    try {
      const { data: promoEvents } = await supabase
        .from("calendar_events")
        .select("title, scheduled_at, metadata")
        .eq("event_type", "promo")
      const overlapping = (promoEvents || []).filter((e: any) => {
        const start = (e.scheduled_at || "").slice(0, 10)
        const end = (((e.metadata as any)?.end_date as string) || start).slice(0, 10)
        return start < monthEndStr && end >= monthStartStr
      })
      if (overlapping.length > 0) promoLabel = overlapping.map((e: any) => e.title).join(" + ")
    } catch {
      /* calendrier indisponible → lecture standard */
    }

    findings.push(
      `Générosité : ${gen.generosite_rate}% (cible 20%, SAV exclu, influence incluse)` +
        (promoLabel ? ` — promo en cours : ${promoLabel}` : "")
    )

    if (gen.generosite_rate > 20) {
      if (promoLabel) {
        newOpportunities.push({
          signal_key: "generosite_over_target",
          title: `Générosité ${gen.generosite_rate}% pendant "${promoLabel}" — mesurer l'arbitrage CA vs marge`,
          description: `La générosité monte à ${gen.generosite_rate}% (cible hors promo 20%) pendant une opération planifiée. Ce n'est pas une dérive — la vraie question : le CA incrémental compense-t-il la marge sacrifiée ?`,
          category: "generosite",
          impact: "medium",
          prompt: `Nous sommes en opération "${promoLabel}" et la générosité du mois ${year}-${String(month).padStart(2, "0")} est à ${gen.generosite_rate}% (vs cible hors promo 20% ; influence ${influencePct}% incluse, SAV exclu). Mesure l'arbitrage : (1) CA du mois vs même mois l'an dernier et vs mois précédent, (2) part de la hausse de générosité due aux prix barrés/remises promo vs le reste (via /api/generosite?year=${year}&month=${month}), (3) verdict chiffré : la promo crée-t-elle du CA incrémental net de marge sacrifiée ? Recommande garder/ajuster les remises pour la fin de l'opération.`,
        })
      } else {
        const drivers = Object.entries(gen.by_category)
          .filter(([t]) => t !== "influencer" && t !== "service_client")
          .map(([t, v]) => ({ label: CODE_TYPE_LABELS[t] || t, pct: pct(v.discount) }))
          .sort((a, b) => b.pct - a.pct)
        const top = drivers[0]
        const driverTxt = top ? `${top.label} (${top.pct}%)` : "remises automatiques"

        newOpportunities.push({
          signal_key: "generosite_over_target",
          title: `Générosité à ${gen.generosite_rate}% (cible 20%)`,
          description: `Générosité ${gen.generosite_rate}% (SAV exclu). Principal poste hors influence : ${driverTxt}. L'influence (${influencePct}%) est stratégique — ne PAS y toucher.`,
          category: "generosite",
          impact: gen.generosite_rate > 30 ? "high" : "medium",
          prompt: `Ma générosité est à ${gen.generosite_rate}% vs cible 20% (codes influenceurs INCLUS mais stratégiques et à NE PAS couper ; SAV exclu). Le principal poste hors influence est ${driverTxt}. Aide-moi à réduire la générosité non-influence (remises automatiques/volume, dotations) sans jamais toucher aux codes influenceurs.`,
        })
      }
    }

    // ── 4bis. OBJECTIFS — écart vs target mensuel + MER ──
    // Altitude stratégique : "il manque X € vs l'objectif" et "1€ de media
    // rapporte Y€ de CA" parlent plus que n'importe quel ROAS plateforme.
    // Source : objectives_2026 (CA HT compta Choose+Shopify+Amazon, saisi à la main).
    try {
      if (year === 2026) {
        const { data: objRow } = await supabase
          .from("objectives_2026")
          .select("ca_2025, ca_2026, media_spent")
          .eq("month", month)
          .single()

        const ca26 = Number(objRow?.ca_2026) || 0
        const ca25 = Number(objRow?.ca_2025) || 0
        const media = Number(objRow?.media_spent) || 0

        if (ca26 > 0 && ca25 > 0) {
          const target = Math.round(ca25 * 1.2)
          const gapEur = Math.round(target - ca26)
          const gapPct = target > 0 ? Math.round(((ca26 - target) / target) * 1000) / 10 : 0
          findings.push(
            `Objectif ${MONTHS_FR[month - 1]} : CA ${Math.round(ca26)}€ HT vs target ${target}€ (${gapPct > 0 ? "+" : ""}${gapPct}%)`
          )

          if (gapPct < -5) {
            newOpportunities.push({
              signal_key: "objective_gap",
              title: `${MONTHS_FR[month - 1].charAt(0).toUpperCase() + MONTHS_FR[month - 1].slice(1)} : ${gapEur}€ sous l'objectif +20%`,
              description: `CA ${MONTHS_FR[month - 1]} : ${Math.round(ca26)}€ HT (compta, tous canaux) vs target ${target}€ (${ca25}€ en 2025 +20%) → ${gapPct}%. Identifier ce qui a manqué et les leviers activables ce mois-ci pour compenser.`,
              category: "shopify",
              impact: gapPct < -15 ? "high" : "medium",
              prompt: `Le CA de ${MONTHS_FR[month - 1]} 2026 est ${Math.round(ca26)}€ HT (compta : Choose + Shopify + Amazon) vs objectif ${target}€ (CA 2025 ${ca25}€ + 20%) → il manque ${gapEur}€ (${gapPct}%). Décompose l'écart : Shopify (data_cache shopify_orders_${year}_${month}), influence (influencer_product_sales), ads (meta_ads_${year}_${month} + google_ads_${year}_${month}), et compare au même mois 2025 si dispo. Puis propose les 3 leviers les plus rapides pour compenser sur le MOIS EN COURS, chiffrés (impact € estimé chacun), sans réduire l'influence.`,
            })
          }
        } else {
          findings.push(`Objectifs : CA ${MONTHS_FR[month - 1]} non saisi → écart vs target non calculé`)
        }

        if (ca26 > 0 && media > 0) {
          const mer = Math.round((ca26 / media) * 10) / 10
          findings.push(`MER ${MONTHS_FR[month - 1]} : ${mer} (CA ${Math.round(ca26)}€ HT ÷ media ${Math.round(media)}€)`)

          // media ≤ 25% du CA (règle maison) ⇔ MER ≥ 4
          if (mer < 4) {
            newOpportunities.push({
              signal_key: "mer_low",
              title: `MER à ${mer} en ${MONTHS_FR[month - 1]} — efficacité media sous le seuil`,
              description: `1€ de media n'a rapporté que ${mer}€ de CA en ${MONTHS_FR[month - 1]} (seuil sain ≥ 4, soit media ≤ 25% du CA). Le MER est l'arbitre honnête au-dessus des ROAS plateformes qui sur-comptent.`,
              category: "meta_ads",
              impact: mer < 3 ? "high" : "medium",
              prompt: `Mon MER de ${MONTHS_FR[month - 1]} 2026 est ${mer} (CA ${Math.round(ca26)}€ HT ÷ media ${Math.round(media)}€ ; seuil sain ≥ 4 car objectif media ≤ 25% du CA). Compare aux mois précédents (table objectives_2026), détermine si le problème vient du spend (splits Meta vs Google dans data_cache) ou du CA, et propose une réallocation chiffrée du budget media. Rappel : ne pas sommer les ROAS plateformes (double-compte) — le MER est l'arbitre ; ne pas toucher au budget influence.`,
            })
          }
        }
      }
    } catch {
      findings.push("Objectifs : analyse écart/MER ignorée (erreur)")
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
          signal_key: "meta_dead_ads",
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
            signal_key: "meta_misaligned_budget",
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
            signal_key: "meta_underinvested_star",
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
            signal_key: "meta_bestseller_no_ads",
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
            signal_key: "meta_creative_extend",
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
            signal_key: "meta_roas_floor",
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
            signal_key: "influence_dormant",
            title: `Réactiver ${dormantNames.length} influenceuses dormantes`,
            description: `${names} avaient des ventes en ${MONTHS_FR[prev.month - 1]} mais aucune ce mois-ci. Relancer avec un nouveau brief ou un produit à tester.`,
            category: "influence",
            impact: "medium",
            prompt: `Ces influenceuses avaient des ventes le mois dernier mais pas ce mois-ci : ${names}. Aide-moi à les relancer : nouveau produit à pitcher ? Brief rafraîchi ? Timing idéal ?`,
          })
          findings.push(`Influence dormantes : ${names}`)
        }

        // Top influencer selling only 1 product → cross-sell opportunity
        // Comparaison via produit CANONIQUE (extractProduct) — l'ancien matching
        // par inclusion de chaîne proposait le TC7+ à une influenceuse qui ne
        // vendait QUE du "Time Control 7+".
        const CANON_PRODUCTS = ["TC7+", "LED Mask", "Hair Force Cap", "Brume Vitamine C"]
        const topInfluencers = Object.entries(currentByInfl)
          .filter(([id]) => nameById[id])
          .sort(([, a], [, b]) => b.revenue - a.revenue)

        for (const [id, data] of topInfluencers) {
          const name = nameById[id]
          const products = [...data.products]
          if (products.length === 1) {
            const sold = products[0]
            const soldCanon = extractProduct(sold)
            const other = CANON_PRODUCTS.find((p) => p !== soldCanon)
            if (other && other !== sold) {
              newOpportunities.push({
                signal_key: "influence_crosssell",
                title: `Cross-sell : proposer le ${other} à ${name}`,
                description: `${name} génère ${Math.round(data.revenue)}€ uniquement sur ${sold}. Lui proposer le ${other} pour diversifier son contenu et nos ventes.`,
                category: "influence",
                impact: "low",
                prompt: `${name} vend uniquement le ${sold} (${Math.round(data.revenue)}€ ce mois via son code). Aide-moi à préparer le pitch du ${other} : arguments produit (fiches Shopify réelles uniquement), angle créatif adapté à son audience, offre à lui proposer (dotation + code), et vérifie d'abord dans influencer_product_sales qu'elle n'a jamais vendu ce produit.`,
              })
              break // 1 cross-sell par run
            }
          }
        }
      }
    } catch {
      findings.push("Influence: analyse des noms ignorée (erreur)")
    }

    // ── 6bis. ROI INFLUENCE — coût réel vs CA tracké par code ──
    // "Prises de parole ROIstes" (recentrage juillet 2026) : forfaits + commissions
    // vs CA par code, par influenceuse. Bande saine ≈ 12-20% (commission seule = 12%).
    // On optimise le MIX (affiliation vs forfait), on ne coupe JAMAIS le canal.
    try {
      const next6 = monthOffset(year, month, -1)
      const monthStart6 = `${year}-${String(month).padStart(2, "0")}-01`
      const monthEnd6 = `${next6.year}-${String(next6.month).padStart(2, "0")}-01`

      const [{ data: fees6 }, { data: comms6 }, { data: sales6 }] = await Promise.all([
        supabase.from("influencer_fixed_fees").select("influencer_id, amount").eq("year", year).eq("month", month),
        supabase.from("influencer_commissions").select("influencer_id, amount").eq("year", year).eq("month", month),
        supabase
          .from("influencer_product_sales")
          .select("influencer_id, line_price")
          .gte("order_date", monthStart6)
          .lt("order_date", monthEnd6),
      ])

      const costBy: Record<string, number> = {}
      for (const f of fees6 || []) if (f.influencer_id) costBy[f.influencer_id] = (costBy[f.influencer_id] || 0) + (Number(f.amount) || 0)
      for (const c of comms6 || []) if (c.influencer_id) costBy[c.influencer_id] = (costBy[c.influencer_id] || 0) + (Number(c.amount) || 0)
      const caBy: Record<string, number> = {}
      for (const s of sales6 || []) if (s.influencer_id) caBy[s.influencer_id] = (caBy[s.influencer_id] || 0) + (Number(s.line_price) || 0)

      const ids6 = [...new Set([...Object.keys(costBy), ...Object.keys(caBy)])]
      const totalCost = Object.values(costBy).reduce((a, b) => a + b, 0)

      if (ids6.length > 0 && totalCost > 500) {
        const { data: infl6 } = await supabase.from("influencers").select("id, name").in("id", ids6)
        const name6: Record<string, string> = Object.fromEntries((infl6 || []).map((i) => [i.id, i.name as string]))
        const rows6 = ids6
          .map((id) => ({ name: name6[id], cost: costBy[id] || 0, ca: caBy[id] || 0 }))
          .filter((x) => x.name)

        const totalCA6 = rows6.reduce((s, x) => s + x.ca, 0)
        const globalRatio = totalCA6 > 0 ? Math.round((totalCost / totalCA6) * 100) : null
        findings.push(
          `ROI influence ${MONTHS_FR[month - 1]} : ${Math.round(totalCost)}€ de coûts pour ${Math.round(totalCA6)}€ de CA tracké par code${globalRatio !== null ? ` (${globalRatio}%)` : ""}`
        )

        // Prises de parole non-ROIstes : coût significatif avec CA nul ou ratio > 40%
        const flops = rows6
          .filter((x) => x.cost >= 500 && (x.ca === 0 || x.cost / Math.max(x.ca, 1) > 0.4))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 5)

        if (flops.length > 0) {
          const flopTxt = flops.map((f) => `${f.name} (${Math.round(f.cost)}€ → ${Math.round(f.ca)}€ CA)`).join(", ")
          const flopCost = Math.round(flops.reduce((s, f) => s + f.cost, 0))
          newOpportunities.push({
            signal_key: "influence_roi_flops",
            title: `${flops.length} prise(s) de parole non-ROIste(s) en ${MONTHS_FR[month - 1]} (${flopCost}€)`,
            description: `Coût élevé vs CA tracké par code : ${flopTxt}. Objectif : optimiser le MIX (affiliation vs forfait), jamais couper le canal. Nuance : le CA par code sous-estime le halo (notoriété, recherche directe).`,
            category: "influence",
            impact: flopCost > 3000 ? "high" : "medium",
            prompt: `En ${MONTHS_FR[month - 1]} 2026, ces collaborations ont un coût/CA tracké défavorable : ${flopTxt} (bande saine ≈ 12-20% ; la commission seule coûte 12%). Pour CHACUNE : (1) vérifie le halo non tracké (influencer_content : contenu posté ? influencer_product_sales : le code convertit-il les mois suivants ?), (2) post-mortem honnête : audience, format, produit pitché, timing ?, (3) recommandation : renégocier en affiliation/hybride, re-brief, ou ne pas renouveler. IMPORTANT : ne PAS réduire le budget influence global — réallouer vers les profils performants.`,
          })
        }

        // Stars sous-exploitées : ratio ≤ 15% avec CA significatif → doubler la mise
        const stars = rows6
          .filter((x) => x.ca >= 3000 && x.cost > 0 && x.cost / x.ca <= 0.15)
          .sort((a, b) => b.ca - a.ca)
          .slice(0, 3)

        if (stars.length > 0) {
          const starTxt = stars
            .map((s) => `${s.name} (${Math.round(s.cost)}€ → ${Math.round(s.ca)}€, ${Math.round((s.cost / s.ca) * 100)}%)`)
            .join(", ")
          newOpportunities.push({
            signal_key: "influence_roi_stars",
            title: `Doubler la mise sur ${stars.length} profil(s) ultra-rentable(s) (≤15% coût/CA)`,
            description: `Meilleur ROI influence de ${MONTHS_FR[month - 1]} : ${starTxt}. Le levier le plus sûr du canal #1 : augmenter la fréquence/l'ambition avec celles qui convertissent déjà.`,
            category: "influence",
            impact: "high",
            prompt: `Ces collaborations tournent à ≤15% de coût/CA en ${MONTHS_FR[month - 1]} 2026 : ${starTxt}. Propose un plan "doubler la mise" pour chacune : fréquence de prises de parole, formats à ajouter (stories récurrentes, réels, live), produit à pitcher ensuite (croiser avec influencer_product_sales pour voir ce qu'elle ne vend pas encore), structure de deal incitative (palier de commission, exclusivité). Chiffre l'upside attendu si son CA mensuel progresse de +50%.`,
          })
        }
      }
    } catch {
      findings.push("ROI influence : analyse ignorée (erreur)")
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
          signal_key: "free_referral",
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
          signal_key: "free_ugc",
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
          signal_key: "cr_bundle",
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
          signal_key: "cr_shipping_threshold",
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

    // ── 9. NOUVEAUX CANAUX — délégué à la routine analyste (companion-analyste, Fable 5).
    // Les 6 idées hardcodées en rotation (TikTok Shop, B2B, presse…) ont été retirées :
    // pas data-driven, c'est le job de l'analyste hebdo qui raisonne avec le contexte.

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
            signal_key: "klaviyo_browse_abandonment",
            title: "Browse Abandonment FR : vérifier le contenu et activer (DRAFT depuis 2024)",
            description:
              "Ce flow capture les visiteurs qui regardent les appareils premium (LED Mask, Hair Force Cap) sans ajouter au panier. L'Abandoned Cart live génère ~80 K€/an — le Browse Abandonment arrive encore plus tôt dans le funnel, sur une audience à très haute intention d'achat.",
            category: "klaviyo",
            impact: "high",
            prompt:
              "Le flow Browse Abandonment FR (Klaviyo FR VTKEVE, ID SY3tSS) est en DRAFT depuis avril 2024. L'Abandoned Cart live (RBK8eD) génère ~80 K€/an ; le Browse Abandonment cible les visiteurs qui ont vu une page produit (dont les appareils premium LED Mask / Hair Force Cap — vérifier les prix actuels sur Shopify, soldes possibles) sans ajouter au panier. Aide-moi à l'activer via le MCP Klaviyo : (1) lis les messages actuels du flow (get_flow avec flow-actions, get_flow_message par action), (2) vérifie que le contenu est en français, personnalisé Talika, sans placeholder, (3) propose une séquence 3 emails — J+1h curiosité, J+24h bénéfices + avis clients, J+72h urgence douce — SANS discount agressif sur des produits premium, (4) montre-moi le contenu final AVANT toute mise en live (règle : demander avant d'envoyer).",
          })
          findings.push("Klaviyo: Browse Abandonment FR toujours en DRAFT")
        }
      }

      // Note : "Reconquête des clients - Standard" est le doublon draft de
      // CHURNER 6 MONTHS (live) — ne PAS générer une opportunité séparée.
      // L'amélioration du CHURNER est gérée via une opportunité dédiée.
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
            signal_key: "klaviyo_upsell_tc7_led",
            title: `${tc7WithoutLED} acheteurs TC7+ sans LED Mask — upsell premium à activer`,
            description: `${pct}% des acheteurs TC7+ (${tc7WithoutLED}/${tc7Total} sur 5 mois) n'ont pas encore le LED Therapy Mask. C'est l'upsell premium le plus logique : même cible, même budget, même bénéfice régénération peau. Le flow post-achat TC7+ est live — y ajouter un email upsell LED Mask à J+30.`,
            category: "klaviyo",
            impact: "high",
            prompt: `Sur 5 mois, ${tc7WithoutLED} acheteurs du TC7+ (${pct}%) n'ont pas le LED Therapy Mask (vérifier le prix actuel sur Shopify — soldes possibles). Le flow Post-Achat TC7+ (XFAHEM) est live depuis le 24/06. Aide-moi à créer l'email upsell LED Mask : timing (J+30 après TC7+ ?), angle (complémentarité, upgrade routine, résultats boostés), offre (sans remise ou livraison gratuite ?), sujet d'email, structure du contenu.`,
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
            signal_key: "klaviyo_crosssell_haircap_serum",
            title: `${hairCapWithoutSerum} acheteurs Hair Cap sans sérum — cross-sell récurrent`,
            description: `${hairCapWithoutSerum} clients du Hair Force Cap n'ont pas encore le Sérum Hair Force (consommable rechargeable). C'est le consommable naturel de l'appareil. Le flow post-achat Hair Cap (SbuN3f) est live — y ajouter un email cross-sell sérum à J+14 = revenu récurrent.`,
            category: "klaviyo",
            impact: "medium",
            prompt: `${hairCapWithoutSerum} acheteurs du Hair Force LED Cap n'ont pas encore le Sérum Hair Force (consommable de l'appareil — vérifier le prix actuel sur Shopify). Le flow post-achat Hair Cap (SbuN3f) est live depuis le 24/06. Aide-moi à rédiger l'email cross-sell sérum : timing (J+14 ?), angle (résultats amplifiés avec le sérum), offre bundle, sujet, structure.`,
          })
          findings.push(`Customer journey: ${hairCapWithoutSerum} acheteurs Hair Cap sans sérum`)
        }
      }
    } catch {
      findings.push("Customer journey: analyse ignorée (erreur)")
    }

    // ── 12. EXPIRY + INSERT (dédup par signal_key, fallback titre) ──
    // Un signal encore vrai est re-généré à chaque run et rafraîchit updated_at ;
    // ce qui n'a pas bougé depuis 30j est du musée → expiré (invisible en pending).
    const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
    const { data: expiredRows } = await supabase
      .from("opportunities")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("status", "pending")
      .lt("updated_at", cutoff)
      .select("id")
    if (expiredRows && expiredRows.length > 0) {
      findings.push(`${expiredRows.length} opportunité(s) expirée(s) (>30j sans rafraîchissement)`)
    }

    let createdCount = 0
    let refreshedCount = 0
    for (const opp of newOpportunities) {
      // Même signal déjà en attente → rafraîchir in-place (chiffres à jour, note
      // préservée). Évite les doublons du type "Générosité 31.3%" + "Générosité
      // 24.9%" quand seul le chiffre du titre change d'un mois à l'autre.
      const { data: same } = await supabase
        .from("opportunities")
        .select("id")
        .eq("status", "pending")
        .eq("signal_key", opp.signal_key)
        .limit(1)

      if (same && same.length > 0) {
        // Rafraîchir SEULEMENT le titre (chiffres à jour) + impact + updated_at.
        // description/prompt sont PRÉSERVÉS : la routine analyste (Fable 5) les
        // enrichit — un run quotidien ne doit pas raser son travail.
        const { error } = await supabase
          .from("opportunities")
          .update({
            title: opp.title,
            impact: opp.impact,
            updated_at: now.toISOString(),
          })
          .eq("id", same[0].id)
        if (!error) refreshedCount++
        continue
      }

      // Fallback : dédup par titre (opps historiques sans signal_key, créées à la main)
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
      createdCount > 0 || refreshedCount > 0
        ? `${createdCount} nouvelle(s) opportunité(s), ${refreshedCount} rafraîchie(s)`
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
        opportunities_refreshed: refreshedCount,
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
