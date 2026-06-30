/**
 * GET /api/routine
 *
 * Returns the monthly routine checklist status.
 * Checks which manual tasks have been done and which are pending.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUncategorizedCodes } from "@/lib/codes-server"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: Request) {
  // La routine ops est aujourd'hui 100% FR/Shopify (cron, cache commandes, codes,
  // objectifs, fees). Sur un autre marché (UK) il n'y a pas encore de routine →
  // on ne renvoie aucun check, pour ne pas afficher de badges/notifications FR
  // trompeurs quand on a basculé en UK. Marché lu via ?market= ou le cookie tk_market.
  const sp = new URL(request.url).searchParams
  const rawMarket = (sp.get("market") || (request.headers.get("cookie") || "").match(/(?:^|;\s*)tk_market=([A-Za-z]{2})/)?.[1] || "FR").toUpperCase()
  if (rawMarket !== "FR") {
    return NextResponse.json({ period: "", month: 0, year: 0, progress: 100, done: 0, total: 0, checks: [] })
  }

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

  // ── 3. Check unassigned discount codes (matching normalisé — cf src/lib/codes-server) ──
  const unassigned = await getUncategorizedCodes(year, month)

  checks.push({
    id: "classify_codes",
    label: "Catégoriser les codes promo",
    description: "Assigner les nouveaux codes aux influenceurs ou les catégoriser (site, gifting, etc.)",
    status: unassigned.length === 0 ? "done" : "pending",
    detail: unassigned.length === 0
      ? "Tous les codes sont catégorisés"
      : `${unassigned.length} code(s) non catégorisé(s)`,
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
    .from("influencer_fixed_fees")
    .select("influencer_id")
    .eq("month", month)
    .eq("year", year)

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
