// Campagnes mensuelles : 1 campagne par mois, auto-remplie avec les influenceuses
// "actives" du mois = celles qui ont un coût enregistré (forfait et/ou commission).
// Une influenceuse qui fait une vente génère une commission (via le cron) → elle
// apparaît donc automatiquement dans la campagne de son mois.
//
// Source de vérité = les tables coûts réconciliées (influencer_fixed_fees /
// influencer_commissions). La campagne ne fait que les AGRÉGER (overlay), elle ne
// duplique aucun montant. Idempotent : relançable sans créer de doublon.
import type { SupabaseClient } from "@supabase/supabase-js"

export const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

export interface SyncMonthlyResult {
  campaign_id: string
  name: string
  created: boolean
  total_active: number
  added: number
}

/**
 * Influenceuses "actives" sur (year, month) = un forfait, OU une commission,
 * OU au moins une vente produit via son code ce mois-là. Le volet ventes rend
 * littéral le « une influ qui fait une vente est ajoutée à la campagne du mois ».
 */
async function activeInfluencerIds(
  supabase: SupabaseClient, year: number, month: number
): Promise<string[]> {
  const start = `${year}-${String(month).padStart(2, "0")}-01`
  const end = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`
  const [fees, comms, sales] = await Promise.all([
    supabase.from("influencer_fixed_fees").select("influencer_id").eq("year", year).eq("month", month),
    supabase.from("influencer_commissions").select("influencer_id").eq("year", year).eq("month", month),
    supabase.from("influencer_product_sales").select("influencer_id").gte("order_date", start).lt("order_date", end),
  ])
  const ids = new Set<string>()
  for (const r of fees.data || []) if (r.influencer_id) ids.add(r.influencer_id)
  for (const r of comms.data || []) if (r.influencer_id) ids.add(r.influencer_id)
  for (const r of sales.data || []) if (r.influencer_id) ids.add(r.influencer_id)
  return [...ids]
}

/**
 * Garantit la campagne du mois (year, month) et y rattache toute influenceuse
 * active non encore présente (stage "actif"). Ne touche jamais aux collabs/themes
 * existants. Retourne le bilan.
 */
export async function syncMonthlyCampaign(
  supabase: SupabaseClient, year: number, month: number
): Promise<SyncMonthlyResult> {
  // 1. Trouver (ou créer) la campagne du mois.
  let { data: campaign } = await supabase
    .from("influence_campaigns")
    .select("id, name")
    .eq("year", year).eq("month", month)
    .maybeSingle()

  let created = false
  if (!campaign) {
    const name = `${MONTH_NAMES[month - 1]} ${year}`
    const start = `${year}-${String(month).padStart(2, "0")}-01`
    const end = new Date(year, month, 0).toISOString().slice(0, 10) // dernier jour du mois
    const { data: inserted, error } = await supabase
      .from("influence_campaigns")
      .insert({ name, year, month, start_date: start, end_date: end, status: "active" })
      .select("id, name")
      .single()
    if (error || !inserted) throw new Error(error?.message || "création campagne mensuelle impossible")
    campaign = inserted
    created = true
  }

  // 2. Influenceuses actives ce mois vs déjà dans la campagne.
  const activeIds = await activeInfluencerIds(supabase, year, month)
  const { data: existing } = await supabase
    .from("influence_campaign_collabs")
    .select("influencer_id")
    .eq("campaign_id", campaign.id)
  const present = new Set((existing || []).map((c) => c.influencer_id))

  const toAdd = activeIds.filter((id) => !present.has(id))
  if (toAdd.length) {
    await supabase.from("influence_campaign_collabs").insert(
      toAdd.map((influencer_id) => ({ campaign_id: campaign!.id, influencer_id, stage: "actif" }))
    )
  }

  return {
    campaign_id: campaign.id,
    name: campaign.name,
    created,
    total_active: activeIds.length,
    added: toAdd.length,
  }
}
