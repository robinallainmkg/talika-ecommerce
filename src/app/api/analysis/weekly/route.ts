import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

interface OrderRow {
  email: string
  total_price: string
  total_discounts: string
  created_at: string
  line_items: { price: string; quantity: number }[]
}

function parseOrders(data: any): OrderRow[] {
  if (!data?.orders) return []
  return data.orders as OrderRow[]
}

// ─── Main ───────────────────────────────────────────────────────

export async function GET() {
  const findings: string[] = []
  const newOpportunities: { title: string; description: string; category: string; impact: string; prompt: string }[] = []

  try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // ── 1. DATA FRESHNESS CHECK ──
    const { data: cronSync } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", "last_cron_sync")
      .single()

    if (cronSync?.data?.ran_at) {
      const lastRun = new Date(cronSync.data.ran_at)
      const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
      if (hoursSince > 48) {
        findings.push(`ALERTE: Dernier cron sync il y a ${Math.round(hoursSince)}h (devrait être <24h)`)
      } else {
        findings.push(`Cron sync OK (dernière exécution il y a ${Math.round(hoursSince)}h)`)
      }
    } else {
      findings.push("ALERTE: Aucun cron sync trouvé")
    }

    // ── 2. REVENUE & ORDERS — current month vs previous ──
    const { data: currentOrders } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${year}_${month}`)
      .single()

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const { data: prevOrders } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", `shopify_orders_${prevYear}_${prevMonth}`)
      .single()

    const current = parseOrders(currentOrders?.data)
    const previous = parseOrders(prevOrders?.data)

    const currentRevenue = current.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
    const previousRevenue = previous.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
    const currentAOV = current.length > 0 ? currentRevenue / current.length : 0
    const previousAOV = previous.length > 0 ? previousRevenue / previous.length : 0

    const revenueDelta = pctChange(currentRevenue, previousRevenue)
    const ordersDelta = pctChange(current.length, previous.length)
    const aovDelta = pctChange(currentAOV, previousAOV)

    findings.push(`Revenue: ${Math.round(currentRevenue)}€ (${revenueDelta > 0 ? "+" : ""}${revenueDelta}% vs mois précédent)`)
    findings.push(`Commandes: ${current.length} (${ordersDelta > 0 ? "+" : ""}${ordersDelta}%)`)
    findings.push(`AOV: ${Math.round(currentAOV)}€ (${aovDelta > 0 ? "+" : ""}${aovDelta}%)`)

    if (revenueDelta < -10) {
      newOpportunities.push({
        title: `Baisse revenue ${revenueDelta}%`,
        description: `Le CA est passé de ${Math.round(previousRevenue)}€ à ${Math.round(currentRevenue)}€ (${revenueDelta}%). Analyser les causes : baisse trafic, conversion, ou panier moyen.`,
        category: "shopify",
        impact: "high",
        prompt: `Le CA a baissé de ${Math.abs(revenueDelta)}% ce mois vs le précédent. Aide-moi à diagnostiquer : est-ce le trafic, la conversion ou le panier moyen ? Vérifie les données Shopify et Meta Ads.`,
      })
    }

    // ── 3. RETENTION — email cross-match ──
    const currentEmails = new Set(current.map((o) => (o.email || "").toLowerCase()).filter(Boolean))
    const previousEmails = new Set(previous.map((o) => (o.email || "").toLowerCase()).filter(Boolean))
    let repeatCount = 0
    for (const email of currentEmails) {
      if (previousEmails.has(email)) repeatCount++
    }
    const retentionRate = previousEmails.size > 0 ? Math.round((repeatCount / previousEmails.size) * 1000) / 10 : 0

    findings.push(`Rétention mois-sur-mois: ${retentionRate}% (${repeatCount}/${previousEmails.size} clients)`)

    if (retentionRate < 5) {
      newOpportunities.push({
        title: `Rétention faible: ${retentionRate}%`,
        description: `Seulement ${repeatCount} clients sur ${previousEmails.size} ont racheté ce mois. Objectif: 10%+. Mettre en place flows post-achat et winback Klaviyo.`,
        category: "retention",
        impact: "high",
        prompt: `Mon taux de rétention mois-sur-mois est à ${retentionRate}% (${repeatCount}/${previousEmails.size}). Aide-moi à créer les flows Klaviyo nécessaires : post-achat cross-sell J+7, winback J+60, et abandon panier optimisé.`,
      })
    }

    // ── 4. GENEROSITE — rate vs 20% target ──
    const totalDiscounts = current.reduce((s, o) => s + parseFloat(o.total_discounts || "0"), 0)
    const generositeRate = currentRevenue > 0 ? Math.round((totalDiscounts / currentRevenue) * 1000) / 10 : 0

    findings.push(`Générosité: ${generositeRate}% (objectif: 20%)`)

    if (generositeRate > 25) {
      newOpportunities.push({
        title: `Générosité à ${generositeRate}% (objectif 20%)`,
        description: `Le taux de générosité est de ${generositeRate}%, soit ${Math.round(generositeRate - 20)}pts au-dessus de l'objectif. Total discounts: ${Math.round(totalDiscounts)}€. Vérifier les auto-discounts actifs.`,
        category: "generosite",
        impact: "high",
        prompt: `Le taux de générosité est à ${generositeRate}% vs objectif 20%. Aide-moi à auditer les automatic discount rules actives sur Shopify et identifier lesquelles désactiver.`,
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

      // Dead ads: >50€ spend, 0 purchases
      const deadAds = ads.filter((a) => a.spend > 50 && a.purchases === 0)
      if (deadAds.length > 0) {
        const deadNames = deadAds.map((a) => `${a.ad_name} (${Math.round(a.spend)}€)`).join(", ")
        const deadSpend = Math.round(deadAds.reduce((s, a) => s + a.spend, 0))
        findings.push(`Dead ads détectées: ${deadAds.length} ads, ${deadSpend}€ gaspillés`)

        newOpportunities.push({
          title: `${deadAds.length} ads Meta à 0 achats (${deadSpend}€)`,
          description: `Ces ads dépensent sans convertir: ${deadNames}. Couper ou réoptimiser.`,
          category: "meta_ads",
          impact: deadSpend > 200 ? "high" : "medium",
          prompt: `J'ai ${deadAds.length} ads Meta qui dépensent ${deadSpend}€ sans aucun achat: ${deadNames}. Aide-moi à décider lesquelles couper et lesquelles réoptimiser.`,
        })
      }

      // ROAS drop check
      const { data: prevMetaMonthly } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", `meta_monthly_${prevYear}_${prevMonth}`)
        .single()

      if (prevMetaMonthly?.data?.summary?.roas) {
        const prevROAS = prevMetaMonthly.data.summary.roas
        const roasDelta = pctChange(overallROAS, prevROAS)
        findings.push(`ROAS trend: ${prevROAS} → ${overallROAS} (${roasDelta > 0 ? "+" : ""}${roasDelta}%)`)

        if (roasDelta < -20) {
          newOpportunities.push({
            title: `ROAS en chute: ${roasDelta}%`,
            description: `Le ROAS Meta est passé de ${prevROAS} à ${overallROAS}. Vérifier les créas, audiences et landing pages.`,
            category: "meta_ads",
            impact: "high",
            prompt: `Le ROAS Meta a chuté de ${Math.abs(roasDelta)}% (${prevROAS} → ${overallROAS}). Aide-moi à diagnostiquer : créas fatiguées, audiences saturées, ou problème de landing page ?`,
          })
        }
      }
    } else {
      findings.push("Meta Ads: pas de données pour ce mois")
    }

    // ── 6. INSERT NEW OPPORTUNITIES ──
    let createdCount = 0
    for (const opp of newOpportunities) {
      // Check if similar opportunity already exists (by title similarity)
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("status", "pending")
        .ilike("title", `%${opp.title.slice(0, 20)}%`)
        .limit(1)

      if (!existing || existing.length === 0) {
        const { error } = await supabase.from("opportunities").insert({
          ...opp,
          status: "pending",
        })
        if (!error) createdCount++
      }
    }

    if (createdCount > 0) {
      findings.push(`${createdCount} nouvelle(s) opportunité(s) créée(s)`)
    } else {
      findings.push("Aucune nouvelle opportunité détectée (ou déjà existantes)")
    }

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
        retention_rate: retentionRate,
        generosite_rate: generositeRate,
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
