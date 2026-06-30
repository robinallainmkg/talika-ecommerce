import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadStatusMap, billingKey } from "@/lib/influence/billing-status"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Résumé de facturation par mois pour une année : combien de collabs (paiement
// dû) ont/n'ont pas de facture. Sert aux badges "sans facture" (onglets de mois
// + item Facturation du menu). Une collab = influenceuse avec forfait OU
// commission > 0 sur le mois.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))
    // Marché courant (?market= sinon cookie tk_market, défaut FR) → on ne compte
    // que les collabs de ce marché, sinon les badges "sans facture" affichent les
    // chiffres FR même quand on a basculé en UK (confusant).
    const rawMarket = (searchParams.get("market") || (request.headers.get("cookie") || "").match(/(?:^|;\s*)tk_market=([A-Za-z]{2})/)?.[1] || "FR").toUpperCase()
    const market = rawMarket === "UK" ? "UK" : "FR"

    const [{ data: fees }, { data: comms }, { data: invoices }, { data: marketInfs }] = await Promise.all([
      supabase.from("influencer_fixed_fees").select("influencer_id, month, amount").eq("year", year),
      supabase.from("influencer_commissions").select("influencer_id, month, amount").eq("year", year),
      supabase.from("influencer_cost_invoices").select("influencer_id, month").eq("year", year),
      supabase.from("influencers").select("id").eq("market", market),
    ])
    const marketIds = new Set((marketInfs || []).map((i) => i.id))

    // Collabs par mois (set d'influenceuses avec un montant dû).
    const collabByMonth: Record<number, Set<string>> = {}
    const addAmounts = (rows: { influencer_id: string; month: number; amount: number | string }[] | null) => {
      for (const r of rows || []) {
        if (marketIds.has(r.influencer_id) && Number(r.amount || 0) > 0 && r.month) (collabByMonth[r.month] ??= new Set()).add(r.influencer_id)
      }
    }
    addAmounts(fees)
    addAmounts(comms)

    const invByMonth: Record<number, Set<string>> = {}
    for (const inv of invoices || []) {
      if (marketIds.has(inv.influencer_id) && inv.month) (invByMonth[inv.month] ??= new Set()).add(inv.influencer_id)
    }

    // Statuts : une collab "reportée", "payée" ou "sans facturation" n'est plus
    // une facture MANQUANTE → seules les "à régler" sans facture comptent.
    const statusMap = await loadStatusMap({ year })

    const months = []
    let total_missing = 0
    for (let m = 1; m <= 12; m++) {
      const collabs = collabByMonth[m] || new Set<string>()
      const inv = invByMonth[m] || new Set<string>()
      let withInvoice = 0
      let missing = 0
      collabs.forEach((id) => {
        const has = inv.has(id)
        if (has) withInvoice++
        const status = statusMap.get(billingKey(id, year, m))?.status || "a_regler"
        if (!has && status === "a_regler") missing++
      })
      total_missing += missing
      months.push({ month: m, count: collabs.size, with_invoice: withInvoice, missing })
    }

    return NextResponse.json({ year, months, total_missing })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
