import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Vue "Facturation" — orientée collabs : une COLLAB = toute influenceuse avec un
// paiement dû ce mois (forfait OU commission). Pour chacune : le libellé de
// facturation (raison sociale, souvent ≠ nom public) et l'état de la facture.
// Réutilise les mêmes tables que l'écran Coûts (forfaits + commissions) et les
// factures (influencer_cost_invoices). Les montants se SAISISSENT dans Coûts ;
// ici on suit la facturation (libellé + facture reçue).

// GET ?year=&month= → collabs du mois + totaux.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))

    const [{ data: influencers }, { data: fees }, { data: comms }, { data: invoices }] =
      await Promise.all([
        supabase.from("influencers").select("id, name, instagram_handle, billing_name"),
        supabase.from("influencer_fixed_fees").select("influencer_id, amount").eq("year", year).eq("month", month),
        supabase.from("influencer_commissions").select("influencer_id, amount").eq("year", year).eq("month", month),
        supabase
          .from("influencer_cost_invoices")
          .select("id, influencer_id, file_name, amount, ocr, created_at")
          .eq("year", year)
          .eq("month", month)
          .order("created_at", { ascending: false }),
      ])

    const feeByInf: Record<string, number> = {}
    for (const f of fees || []) feeByInf[f.influencer_id] = Number(f.amount || 0)
    const commByInf: Record<string, number> = {}
    for (const c of comms || []) commByInf[c.influencer_id] = Number(c.amount || 0)

    const invByInf: Record<string, { id: string; file_name: string; amount: number | null }[]> = {}
    const supplierByInf: Record<string, string> = {}
    for (const inv of invoices || []) {
      ;(invByInf[inv.influencer_id] ??= []).push({ id: inv.id, file_name: inv.file_name, amount: inv.amount })
      // Nom de société lu sur la facture (OCR) → suggestion de libellé.
      const supplier = (inv.ocr as { supplier?: string } | null)?.supplier
      if (supplier && !supplierByInf[inv.influencer_id]) supplierByInf[inv.influencer_id] = supplier
    }

    const byId: Record<string, { id: string; name: string; instagram_handle: string | null; billing_name: string | null }> = {}
    for (const inf of influencers || []) byId[inf.id] = inf

    // Une collab = un paiement dû ce mois (forfait > 0 ou commission > 0).
    const ids = new Set([...Object.keys(feeByInf), ...Object.keys(commByInf)])
    const collabs = Array.from(ids)
      .map((id) => {
        const inf = byId[id]
        if (!inf) return null
        const fixed_fee = feeByInf[id] || 0
        const commission = commByInf[id] || 0
        const total_due = Math.round((fixed_fee + commission) * 100) / 100
        const invs = invByInf[id] || []
        return {
          influencer_id: id,
          name: inf.name,
          instagram_handle: inf.instagram_handle || null,
          billing_name: inf.billing_name || null,
          ocr_supplier: supplierByInf[id] || null,
          fixed_fee,
          commission,
          total_due,
          invoices: invs,
          has_invoice: invs.length > 0,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null && r.total_due > 0)
      .sort((a, b) => b.total_due - a.total_due)

    const total_due = Math.round(collabs.reduce((s, c) => s + c.total_due, 0) * 100) / 100
    const with_invoice = collabs.filter((c) => c.has_invoice).length

    return NextResponse.json({
      period: { year, month },
      collabs,
      totals: { count: collabs.length, total_due, with_invoice },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// POST { influencer_id, billing_name } → enregistre le libellé de facturation
// (attribut de l'influenceuse, pas mensuel → non bloqué par le verrou du mois).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = body.influencer_id as string
    if (!id) return NextResponse.json({ error: "influencer_id requis" }, { status: 400 })
    const raw = typeof body.billing_name === "string" ? body.billing_name.trim() : ""
    const billing_name = raw === "" ? null : raw.slice(0, 200)

    const { error } = await supabase.from("influencers").update({ billing_name }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, billing_name })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
