/**
 * syncPnLAuto — pré-calcul des lignes "auto" du P&L (table pnl_lines).
 *
 * Branché sur les données déjà collectées par le reste du pipeline :
 *   - Ventes Shopify ← shopify_analytics / shopify_orders (data_cache)
 *   - Meta Ads       ← meta_monthly (data_cache)
 *   - Google Ads     ← google_ads (data_cache)
 *   - Influence      ← influencer_commissions + influencer_fixed_fees (tables)
 *
 * Règle "calcule une fois, puis figé" (demande Robin) : on (re)calcule une cellule
 * auto à chaque sync TANT QU'ELLE N'A PAS été éditée à la main. Dès que l'admin
 * écrase la valeur dans l'UI, la cellule passe source:"manual" → ici on la SKIP
 * pour toujours. Réactivable via l'action "↺ auto" (repasse source:"auto").
 *
 * Convention de signe (comme le reste de pnl_lines) : CA positif, coûts négatifs.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

type AutoCompute = "shopify_revenue" | "meta_spend" | "google_spend" | "influence_cost"

export interface AutoLineDef {
  category: string
  subcategory: string
  sort_order: number
  /** +1 = revenu (positif), -1 = coût (stocké négatif) */
  sign: 1 | -1
  compute: AutoCompute
}

/** Lignes du P&L alimentées automatiquement. Réutilisé par le seed pour l'ordre. */
export const AUTO_LINES: AutoLineDef[] = [
  { category: "Chiffre d'affaires", subcategory: "Ventes Shopify", sort_order: 10, sign: 1, compute: "shopify_revenue" },
  { category: "Marketing", subcategory: "Meta Ads", sort_order: 200, sign: -1, compute: "meta_spend" },
  { category: "Marketing", subcategory: "Google Ads", sort_order: 210, sign: -1, compute: "google_spend" },
  { category: "Marketing", subcategory: "Influence", sort_order: 220, sign: -1, compute: "influence_cost" },
]

async function getCache(supabase: SupabaseClient, key: string): Promise<any | null> {
  const { data } = await supabase.from("data_cache").select("data").eq("key", key).maybeSingle()
  return data?.data ?? null
}

/** CA Shopify TTC du mois : analytics (léger) sinon somme des commandes non annulées. */
async function shopifyRevenue(supabase: SupabaseClient, year: number, m: number): Promise<number | null> {
  const analytics = await getCache(supabase, `shopify_analytics_${year}_${m}`)
  if (analytics && analytics.total_revenue != null) return Number(analytics.total_revenue)

  const ordersBlob = await getCache(supabase, `shopify_orders_${year}_${m}`)
  const orders = ordersBlob?.orders
  if (!Array.isArray(orders)) return null
  return orders
    .filter((o: any) => !o.cancelled_at)
    .reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0)
}

async function metaSpend(supabase: SupabaseClient, year: number, m: number): Promise<number | null> {
  const meta = await getCache(supabase, `meta_monthly_${year}_${m}`)
  const spend = meta?.summary?.spend
  return spend != null ? Number(spend) : null
}

async function googleSpend(supabase: SupabaseClient, year: number, m: number): Promise<number | null> {
  const g = await getCache(supabase, `google_ads_${year}_${m}`)
  const spend = g?.summary?.spend
  return spend != null ? Number(spend) : null
}

/** Coût influence du mois : commissions + fixes (droits d'image inclus). */
async function influenceCost(supabase: SupabaseClient, year: number, m: number): Promise<number | null> {
  const [{ data: comm }, { data: fees }] = await Promise.all([
    supabase.from("influencer_commissions").select("amount").eq("year", year).eq("month", m),
    supabase.from("influencer_fixed_fees").select("amount").eq("year", year).eq("month", m),
  ])
  const rows = [...(comm || []), ...(fees || [])]
  if (rows.length === 0) return null
  return rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
}

async function computeValue(
  supabase: SupabaseClient,
  compute: AutoCompute,
  year: number,
  m: number
): Promise<number | null> {
  switch (compute) {
    case "shopify_revenue": return shopifyRevenue(supabase, year, m)
    case "meta_spend": return metaSpend(supabase, year, m)
    case "google_spend": return googleSpend(supabase, year, m)
    case "influence_cost": return influenceCost(supabase, year, m)
  }
}

export interface PnLAutoResult {
  year: number
  written: number
  frozen: number
  details: Record<string, { written: number; frozen: number; skipped_no_data: number }>
}

/**
 * (Re)calcule les lignes auto pour toute l'année `year`.
 * N'écrase JAMAIS une cellule passée en source:"manual".
 */
export async function syncPnLAuto(supabase: SupabaseClient, year: number): Promise<PnLAutoResult> {
  // 1. Snapshot des cellules auto-éligibles déjà en base (pour respecter le figeage)
  const subs = AUTO_LINES.map((l) => l.subcategory)
  const { data: existing } = await supabase
    .from("pnl_lines")
    .select("id, subcategory, month, source")
    .eq("year", year)
    .eq("parent", "")
    .in("subcategory", subs)

  const existingMap = new Map<string, { id: string; source: string }>()
  for (const r of existing || []) existingMap.set(`${r.subcategory}|${r.month}`, { id: r.id, source: r.source })

  const result: PnLAutoResult = { year, written: 0, frozen: 0, details: {} }
  const toUpsert: any[] = []

  for (const line of AUTO_LINES) {
    const d = (result.details[line.subcategory] = { written: 0, frozen: 0, skipped_no_data: 0 })
    for (let m = 1; m <= 12; m++) {
      const raw = await computeValue(supabase, line.compute, year, m)
      if (raw == null) { d.skipped_no_data++; continue }

      const existingCell = existingMap.get(`${line.subcategory}|${m}`)
      if (existingCell && existingCell.source === "manual") { d.frozen++; result.frozen++; continue }

      const amount = Math.round(line.sign * Math.abs(raw) * 100) / 100
      toUpsert.push({
        category: line.category,
        parent: "",
        subcategory: line.subcategory,
        month: m,
        year,
        amount,
        source: "auto",
        sort_order: line.sort_order,
        updated_at: new Date().toISOString(),
      })
      d.written++
      result.written++
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("pnl_lines")
      .upsert(toUpsert, { onConflict: "category,parent,subcategory,month,year" })
    if (error) throw new Error(`pnl auto upsert: ${error.message}`)
  }

  return result
}
