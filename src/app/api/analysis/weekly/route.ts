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

// ─── Main ───────────────────────────────────────────────────────

export async function GET() {
  const findings: string[] = []
  const newOpportunities: { title: string; description: string; category: string; impact: string; prompt: string }[] = []

  try {
    const now = new Date()
    // On analyse le DERNIER MOIS COMPLET (jamais le mois en cours : en début de mois,
    // 1–2 jours de data donnent des ratios absurdes — ex. générosité 44%, rétention 4%).
    const ref = monthOffset(now.getFullYear(), now.getMonth() + 1, 1)
    const year = ref.year
    const month = ref.month
    const prev = monthOffset(year, month, 1)

    // ── 1. DATA FRESHNESS CHECK ──
    const { data: cronSync } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", "last_cron_sync")
      .single()

    if (cronSync?.data?.ran_at) {
      const hoursSince = (now.getTime() - new Date(cronSync.data.ran_at).getTime()) / 3600000
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

    // Garde-fou : pas assez de données pour des ratios fiables
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

    if (returningRate < 15 && currentEmails.size > 50) {
      newOpportunities.push({
        title: `Clients revenants à ${returningRate}%`,
        description: `${returning} clients sur ${currentEmails.size} avaient déjà acheté dans les 3 mois précédents. Levier : flows post-achat Klaviyo (les 3 appareils — TC7+/Hair Cap/LED Mask — sont en cours) + winback.`,
        category: "retention",
        impact: "medium",
        prompt: `Mon taux de clients revenants (3 mois) est à ${returningRate}% (${returning}/${currentEmails.size}). Aide-moi à le monter via les flows Klaviyo post-achat (appareils) et un winback, sans réduire l'acquisition influence.`,
      })
    }

    // ── 4. GÉNÉROSITÉ — calcul fiable, table-driven (cf src/lib/generosite) ──
    const codeMap = await loadCodeCategoryMap()
    const gen = computeGenerosite(current, codeMap)
    const pct = (amount: number) => (gen.ca_brut > 0 ? Math.round((amount / gen.ca_brut) * 1000) / 10 : 0)
    const influencePct = pct(gen.by_category.influencer?.discount || 0)

    findings.push(`Générosité : ${gen.generosite_rate}% (cible 20%, SAV exclu, influence incluse)`)

    if (gen.generosite_rate > 20) {
      // Principal levier HORS influence (jamais couper l'influence = stratégique)
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

    // ── 5. META ADS — ROAS + dead ads ──
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

      const deadAds = ads.filter((a) => a.spend > 50 && a.purchases === 0)
      if (deadAds.length > 0) {
        const deadNames = deadAds.map((a) => `${a.ad_name} (${Math.round(a.spend)}€)`).join(", ")
        const deadSpend = Math.round(deadAds.reduce((s, a) => s + a.spend, 0))
        findings.push(`Dead ads: ${deadAds.length} ads, ${deadSpend}€ gaspillés`)
        newOpportunities.push({
          title: `${deadAds.length} ads Meta à 0 achats (${deadSpend}€)`,
          description: `Ces ads dépensent sans convertir: ${deadNames}. Couper ou réoptimiser.`,
          category: "meta_ads",
          impact: deadSpend > 200 ? "high" : "medium",
          prompt: `J'ai ${deadAds.length} ads Meta qui dépensent ${deadSpend}€ sans achat: ${deadNames}. Aide-moi à décider lesquelles couper ou réoptimiser.`,
        })
      }

      const { data: prevMetaMonthly } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `meta_monthly_${prev.year}_${prev.month}`)
        .single()

      if (prevMetaMonthly?.data?.summary?.roas) {
        const prevROAS = prevMetaMonthly.data.summary.roas
        const roasDelta = pctChange(overallROAS, prevROAS)
        findings.push(`ROAS trend: ${prevROAS} → ${overallROAS} (${roasDelta > 0 ? "+" : ""}${roasDelta}%)`)
        if (roasDelta < -20) {
          newOpportunities.push({
            title: `ROAS en chute: ${roasDelta}%`,
            description: `Le ROAS Meta est passé de ${prevROAS} à ${overallROAS}. Vérifier créas, audiences et landing pages.`,
            category: "meta_ads",
            impact: "high",
            prompt: `Le ROAS Meta a chuté de ${Math.abs(roasDelta)}% (${prevROAS} → ${overallROAS}). Aide-moi à diagnostiquer : créas fatiguées, audiences saturées, ou landing page ?`,
          })
        }
      }
    } else {
      findings.push("Meta Ads: pas de données pour ce mois")
    }

    // ── 6. INSERT NEW OPPORTUNITIES (dédup par titre) ──
    let createdCount = 0
    for (const opp of newOpportunities) {
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("status", "pending")
        .ilike("title", `%${opp.title.slice(0, 20)}%`)
        .limit(1)

      if (!existing || existing.length === 0) {
        const { error } = await supabase.from("opportunities").insert({ ...opp, status: "pending" })
        if (!error) createdCount++
      }
    }

    findings.push(createdCount > 0 ? `${createdCount} nouvelle(s) opportunité(s) créée(s)` : "Aucune nouvelle opportunité")

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
