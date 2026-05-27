/**
 * GET /api/routine
 *
 * Returns the monthly routine checklist status.
 * Checks which manual tasks have been done and which are pending.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const checks: {
    id: string
    label: string
    description: string
    status: "done" | "pending" | "warning"
    detail?: string
    link?: string
  }[] = []

  // ── 1. Check last cron sync ──
  const { data: cronData } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", "last_cron_sync")
    .single()

  const lastSync = cronData?.data as any
  if (lastSync?.ran_at) {
    const syncDate = new Date(lastSync.ran_at)
    const hoursAgo = Math.round((now.getTime() - syncDate.getTime()) / 3600000)
    checks.push({
      id: "cron_sync",
      label: "Sync automatique",
      description: "Cron quotidien Shopify (orders, codes, influenceurs, objectifs)",
      status: hoursAgo < 48 ? "done" : "warning",
      detail: hoursAgo < 48
        ? `Dernier sync il y a ${hoursAgo}h (${lastSync.orders_count} commandes)`
        : `Dernier sync il y a ${hoursAgo}h — vérifier le cron`,
      link: "/dashboard",
    })
  } else {
    checks.push({
      id: "cron_sync",
      label: "Sync automatique",
      description: "Cron quotidien Shopify (orders, codes, influenceurs, objectifs)",
      status: "warning",
      detail: "Aucun sync automatique détecté. Configurer CRON_SECRET dans Vercel.",
      link: "/dashboard",
    })
  }

  // ── 2. Check orders cache freshness ──
  const { data: ordersCache } = await supabase
    .from("data_cache")
    .select("data, updated_at")
    .eq("key", `shopify_orders_${year}_${month}`)
    .single()

  if (ordersCache) {
    const orderCount = (ordersCache.data as any)?.count || 0
    checks.push({
      id: "orders_cache",
      label: `Commandes ${getMonthName(month)}`,
      description: "Cache des commandes Shopify du mois en cours",
      status: "done",
      detail: `${orderCount} commandes en cache`,
    })
  } else {
    checks.push({
      id: "orders_cache",
      label: `Commandes ${getMonthName(month)}`,
      description: "Cache des commandes Shopify du mois en cours",
      status: "pending",
      detail: "Pas de données. Cliquer Sync Shopify sur la page Générosité.",
      link: "/generosite",
    })
  }

  // ── 3. Check unassigned discount codes ──
  const { data: discountCache } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", `shopify_discount_codes_${year}`)
    .single()

  const { data: knownCodes } = await supabase
    .from("influencer_codes")
    .select("code")

  const knownSet = new Set((knownCodes || []).map(c => c.code.toUpperCase()))
  const shopifyCodes = Array.isArray(discountCache?.data) ? discountCache.data : []
  const unassigned = shopifyCodes.filter((c: any) => !knownSet.has((c.code || "").toUpperCase()))

  checks.push({
    id: "classify_codes",
    label: "Catégoriser les codes promo",
    description: "Assigner les nouveaux codes aux influenceurs ou les catégoriser (site, gifting, etc.)",
    status: unassigned.length === 0 ? "done" : "pending",
    detail: unassigned.length === 0
      ? "Tous les codes sont catégorisés"
      : `${unassigned.length} code(s) non attribué(s)`,
    link: "/influencers",
  })

  // ── 4. Check CA values in objectives ──
  const { data: objectives } = await supabase
    .from("objectives_2026")
    .select("month, ca_2025, ca_2026, media_spent")
    .lte("month", month)

  const missingCA: number[] = []
  const missingMedia: number[] = []
  for (const obj of (objectives || [])) {
    if (!obj.ca_2026 || obj.ca_2026 === 0) missingCA.push(obj.month)
    if (!obj.media_spent && obj.media_spent !== 0) missingMedia.push(obj.month)
  }

  checks.push({
    id: "ca_values",
    label: "Saisir CA mensuel",
    description: "Entrer CA 2025 + CA 2026 depuis le Reporting Global Excel (Shopify + Amazon + Choose)",
    status: missingCA.length === 0 ? "done" : "pending",
    detail: missingCA.length === 0
      ? `CA renseigné pour les ${month} mois`
      : `CA manquant pour : ${missingCA.map(m => getMonthName(m)).join(", ")}`,
    link: "/objectives",
  })

  checks.push({
    id: "media_spent",
    label: "Saisir Media Spent",
    description: "Entrer les dépenses media/ads depuis le Reporting Global Excel",
    status: missingMedia.length === 0 ? "done" : "pending",
    detail: missingMedia.length === 0
      ? `Media spent renseigné pour les ${month} mois`
      : `Manquant pour : ${missingMedia.map(m => getMonthName(m)).join(", ")}`,
    link: "/objectives",
  })

  // ── 5. Check influencer fees ──
  const { data: influencers } = await supabase
    .from("influencers")
    .select("id, name")
    .eq("is_active", true)

  const { data: fees } = await supabase
    .from("influencer_fees")
    .select("influencer_id")
    .gte("period_start", `${year}-${String(month).padStart(2, "0")}-01`)
    .lte("period_start", `${year}-${String(month).padStart(2, "0")}-28`)

  const feeInfluencerIds = new Set((fees || []).map(f => f.influencer_id))
  const influencersWithoutFees = (influencers || []).filter(i => !feeInfluencerIds.has(i.id))

  checks.push({
    id: "influencer_fees",
    label: "Fees influenceurs",
    description: "Ajouter les fees/factures mensuelles pour chaque influenceur actif",
    status: influencersWithoutFees.length === 0 ? "done" : "pending",
    detail: influencersWithoutFees.length === 0
      ? `Fees ajoutées pour tous les influenceurs`
      : `${influencersWithoutFees.length} influenceur(s) sans fee ce mois`,
    link: "/influencers",
  })

  const doneCount = checks.filter(c => c.status === "done").length
  const totalCount = checks.length

  return NextResponse.json({
    period: `${getMonthName(month)} ${year}`,
    month,
    year,
    progress: Math.round((doneCount / totalCount) * 100),
    done: doneCount,
    total: totalCount,
    checks,
  })
}

function getMonthName(m: number): string {
  return ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][m - 1] || ""
}
