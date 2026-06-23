import { createClient } from "@supabase/supabase-js"

// Statut de facturation par collab (influenceuse × mois). Source : table
// influence_billing_status. Absence de ligne = "a_regler" (défaut).
//   a_regler        : à régler (défaut) — compte dans alertes/coûts.
//   reporte         : paiement reporté (vers deferred_to_*) — sort des alertes.
//   paye            : réglé — sort des alertes, coût conservé.
//   sans_facturation: annulé — sort des alertes ET du coût (générosité hors-scope,
//                     mais acquisition/scoreboard/total Facturation excluent).

export type BillingStatus = "a_regler" | "reporte" | "paye" | "sans_facturation"
export const BILLING_STATUSES: BillingStatus[] = ["a_regler", "reporte", "paye", "sans_facturation"]

export interface StatusRow {
  influencer_id: string
  year: number
  month: number
  status: BillingStatus
  deferred_to_year: number | null
  deferred_to_month: number | null
  note: string | null
}

export const billingKey = (inf: string, y: number, m: number) => `${inf}|${y}|${m}`

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

// Tous les statuts (optionnellement filtrés par année) → Map key `inf|y|m`.
export async function loadStatusMap(opts: { year?: number } = {}): Promise<Map<string, StatusRow>> {
  let q = client()
    .from("influence_billing_status")
    .select("influencer_id, year, month, status, deferred_to_year, deferred_to_month, note")
  if (opts.year != null) q = q.eq("year", opts.year)
  const { data } = await q
  const map = new Map<string, StatusRow>()
  for (const r of (data || []) as StatusRow[]) map.set(billingKey(r.influencer_id, r.year, r.month), r)
  return map
}

// Clés (inf|y|m) en "sans_facturation" → à EXCLURE des coûts (acquisition,
// scoreboard, total Facturation). Optionnellement filtrées par année.
export async function loadExcludedKeys(opts: { year?: number } = {}): Promise<Set<string>> {
  let q = client()
    .from("influence_billing_status")
    .select("influencer_id, year, month")
    .eq("status", "sans_facturation")
  if (opts.year != null) q = q.eq("year", opts.year)
  const { data } = await q
  const set = new Set<string>()
  for (const r of (data || []) as { influencer_id: string; year: number; month: number }[]) {
    set.add(billingKey(r.influencer_id, r.year, r.month))
  }
  return set
}
