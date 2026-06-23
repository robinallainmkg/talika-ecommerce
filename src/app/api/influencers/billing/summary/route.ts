import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

    const [{ data: fees }, { data: comms }, { data: invoices }] = await Promise.all([
      supabase.from("influencer_fixed_fees").select("influencer_id, month, amount").eq("year", year),
      supabase.from("influencer_commissions").select("influencer_id, month, amount").eq("year", year),
      supabase.from("influencer_cost_invoices").select("influencer_id, month").eq("year", year),
    ])

    // Collabs par mois (set d'influenceuses avec un montant dû).
    const collabByMonth: Record<number, Set<string>> = {}
    const addAmounts = (rows: { influencer_id: string; month: number; amount: number | string }[] | null) => {
      for (const r of rows || []) {
        if (Number(r.amount || 0) > 0 && r.month) (collabByMonth[r.month] ??= new Set()).add(r.influencer_id)
      }
    }
    addAmounts(fees)
    addAmounts(comms)

    const invByMonth: Record<number, Set<string>> = {}
    for (const inv of invoices || []) {
      if (inv.month) (invByMonth[inv.month] ??= new Set()).add(inv.influencer_id)
    }

    const months = []
    let total_missing = 0
    for (let m = 1; m <= 12; m++) {
      const collabs = collabByMonth[m] || new Set<string>()
      const inv = invByMonth[m] || new Set<string>()
      let withInvoice = 0
      collabs.forEach((id) => { if (inv.has(id)) withInvoice++ })
      const missing = collabs.size - withInvoice
      total_missing += missing
      months.push({ month: m, count: collabs.size, with_invoice: withInvoice, missing })
    }

    return NextResponse.json({ year, months, total_missing })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
