// Campagnes mensuelles : 1 campagne par mois, auto-remplie avec les influenceuses
// "actives" du mois = celles qui ont un coût enregistré (forfait et/ou commission).
// Les ventes seules n'ajoutent PAS au board (sinon les codes evergreen polluent
// « Actif ») ; une influ sans coût se glisse à la main.
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
 * Influenceuses "actives" sur (year, month) = celles qui ont un COÛT enregistré
 * ce mois-là : un forfait OU une commission. Les ventes seules (un code evergreen
 * qui tourne) n'ajoutent PLUS personne au board — elles polluaient « Actif » avec
 * des influ qu'on ne suit pas activement. Une vraie collab a un coût ; sinon on la
 * glisse à la main (bouton Ajouter).
 */
async function activeInfluencerIds(
  supabase: SupabaseClient, year: number, month: number
): Promise<string[]> {
  const [fees, comms] = await Promise.all([
    supabase.from("influencer_fixed_fees").select("influencer_id").eq("year", year).eq("month", month),
    supabase.from("influencer_commissions").select("influencer_id").eq("year", year).eq("month", month),
  ])
  const ids = new Set<string>()
  for (const r of fees.data || []) if (r.influencer_id) ids.add(r.influencer_id)
  for (const r of comms.data || []) if (r.influencer_id) ids.add(r.influencer_id)
  return [...ids]
}

/**
 * Garantit la campagne du mois (year, month) sur `market` et y rattache toute
 * influenceuse active non encore présente (stage "actif"). Ne touche jamais aux
 * collabs/themes existants. Retourne le bilan.
 * Le marché doit être explicite : sans lui, la campagne d'un autre marché sur le
 * même mois serait recyclée (et l'insert créerait une campagne sans marché).
 */
export async function syncMonthlyCampaign(
  supabase: SupabaseClient, year: number, month: number, market = "FR"
): Promise<SyncMonthlyResult> {
  // 1. Trouver (ou créer) la campagne du mois.
  let { data: campaign } = await supabase
    .from("influence_campaigns")
    .select("id, name")
    .eq("year", year).eq("month", month).eq("market", market)
    .maybeSingle()

  let created = false
  if (!campaign) {
    const name = `${MONTH_NAMES[month - 1]} ${year}`
    const start = `${year}-${String(month).padStart(2, "0")}-01`
    const end = new Date(year, month, 0).toISOString().slice(0, 10) // dernier jour du mois
    const { data: inserted, error } = await supabase
      .from("influence_campaigns")
      .insert({ name, year, month, market, start_date: start, end_date: end, status: "active" })
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
