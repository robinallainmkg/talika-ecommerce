import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadStatusMap, billingKey, type BillingStatus } from "@/lib/influence/billing-status"

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

    // Forfaits/commissions chargés sur TOUTE l'année : sert au mois courant ET aux
    // montants des reports entrants (collabs reportées depuis un autre mois).
    const [{ data: influencers }, { data: feesY }, { data: commsY }, { data: invoices }] =
      await Promise.all([
        supabase.from("influencers").select("id, name, instagram_handle, billing_name"),
        supabase.from("influencer_fixed_fees").select("influencer_id, year, month, amount").eq("year", year),
        supabase.from("influencer_commissions").select("influencer_id, year, month, amount").eq("year", year),
        supabase
          .from("influencer_cost_invoices")
          .select("id, influencer_id, file_name, amount, ocr, created_at")
          .eq("year", year)
          .eq("month", month)
          .order("created_at", { ascending: false }),
      ])
    const statusMap = await loadStatusMap({ year })

    // Map montants par clé inf|y|m (toute l'année).
    const feeMap: Record<string, number> = {}
    const commMap: Record<string, number> = {}
    const feeByInf: Record<string, number> = {}
    const commByInf: Record<string, number> = {}
    for (const f of feesY || []) {
      feeMap[billingKey(f.influencer_id, f.year, f.month)] = Number(f.amount || 0)
      if (f.month === month) feeByInf[f.influencer_id] = Number(f.amount || 0)
    }
    for (const c of commsY || []) {
      commMap[billingKey(c.influencer_id, c.year, c.month)] = Number(c.amount || 0)
      if (c.month === month) commByInf[c.influencer_id] = Number(c.amount || 0)
    }

    const invByInf: Record<string, { id: string; file_name: string; amount: number | null }[]> = {}
    const supplierByInf: Record<string, string> = {}
    for (const inv of invoices || []) {
      ;(invByInf[inv.influencer_id] ??= []).push({ id: inv.id, file_name: inv.file_name, amount: inv.amount })
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
        const st = statusMap.get(billingKey(id, year, month))
        const status: BillingStatus = st?.status || "a_regler"
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
          status,
          deferred_to: st && st.deferred_to_year && st.deferred_to_month
            ? { year: st.deferred_to_year, month: st.deferred_to_month }
            : null,
          note: st?.note || null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null && r.total_due > 0)
      .sort((a, b) => b.total_due - a.total_due)

    // Total à régler = collabs hors "sans facturation". On remonte aussi le montant
    // exclu (disclaimer de transparence).
    const active = collabs.filter((c) => c.status !== "sans_facturation")
    const total_due = Math.round(active.reduce((s, c) => s + c.total_due, 0) * 100) / 100
    const excluded = collabs.filter((c) => c.status === "sans_facturation")
    const excluded_amount = Math.round(excluded.reduce((s, c) => s + c.total_due, 0) * 100) / 100
    const with_invoice = active.filter((c) => c.has_invoice).length

    // Reports entrants : collabs reportées DEPUIS un autre mois VERS ce mois.
    const reports_in: { influencer_id: string; name: string; from_year: number; from_month: number; amount: number }[] = []
    for (const st of statusMap.values()) {
      if (st.status === "reporte" && st.deferred_to_year === year && st.deferred_to_month === month) {
        const amt = (feeMap[billingKey(st.influencer_id, st.year, st.month)] || 0) +
          (commMap[billingKey(st.influencer_id, st.year, st.month)] || 0)
        reports_in.push({
          influencer_id: st.influencer_id,
          name: byId[st.influencer_id]?.name || "?",
          from_year: st.year,
          from_month: st.month,
          amount: Math.round(amt * 100) / 100,
        })
      }
    }
    const reports_in_total = Math.round(reports_in.reduce((s, r) => s + r.amount, 0) * 100) / 100

    return NextResponse.json({
      period: { year, month },
      collabs,
      totals: { count: active.length, total_due, with_invoice, excluded_count: excluded.length, excluded_amount },
      reports_in,
      reports_in_total,
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
