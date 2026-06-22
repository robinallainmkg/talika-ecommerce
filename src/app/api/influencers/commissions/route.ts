import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const pad = (n: number) => String(n).padStart(2, "0")

// Écran "Coûts du mois" — gère les DEUX types de rému (forfait + commission), par
// mois (une influenceuse peut être au forfait un mois, en commission un autre).
// La commission est SUGGÉRÉE (commission_rate % × ventes du code) mais jamais
// imposée : la plupart du temps il n'y a pas de commission quand il y a un forfait.

// GET ?year=&month= — par influenceuse : ventes du mois, commission suggérée,
// + ce qui est déjà saisi (forfait & commission). Renvoie aussi la liste complète
// des influenceuses pour pouvoir en ajouter une (ex. nouveau forfait sans ventes).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()))
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1))

    const monthStart = `${year}-${pad(month)}-01`
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`

    const [{ data: influencers }, { data: sales }, { data: savedComm }, { data: fees }] =
      await Promise.all([
        supabase.from("influencers").select("id, name, commission_rate, has_fixed_fee, status"),
        supabase
          .from("influencer_product_sales")
          .select("influencer_id, line_price")
          .gte("order_date", monthStart)
          .lt("order_date", nextMonth),
        supabase
          .from("influencer_commissions")
          .select("influencer_id, amount")
          .eq("year", year)
          .eq("month", month),
        supabase
          .from("influencer_fixed_fees")
          .select("influencer_id, amount")
          .eq("year", year)
          .eq("month", month),
      ])

    const salesByInf: Record<string, number> = {}
    for (const s of sales || []) {
      salesByInf[s.influencer_id] = (salesByInf[s.influencer_id] || 0) + Number(s.line_price || 0)
    }
    const savedByInf: Record<string, number> = {}
    for (const c of savedComm || []) savedByInf[c.influencer_id] = Number(c.amount || 0)
    const feeByInf: Record<string, number> = {}
    for (const f of fees || []) feeByInf[f.influencer_id] = Number(f.amount || 0)

    const all = (influencers || []).map((inf) => {
      const monthSales = salesByInf[inf.id] || 0
      const rate = Number(inf.commission_rate) || 0
      return {
        influencer_id: inf.id,
        name: inf.name,
        commission_rate: rate,
        has_fixed_fee: !!inf.has_fixed_fee,
        month_sales: Math.round(monthSales * 100) / 100,
        suggested_commission: rate > 0 && monthSales > 0 ? Math.round((monthSales * rate) / 100 * 100) / 100 : null,
        saved_commission: inf.id in savedByInf ? savedByInf[inf.id] : null,
        fixed_fee: inf.id in feeByInf ? feeByInf[inf.id] : null,
      }
    })

    // Lignes "pertinentes" ce mois : ventes, ou un coût déjà saisi, ou marquée forfait.
    const rows = all
      .filter((r) => r.month_sales > 0 || r.saved_commission != null || r.fixed_fee != null || r.has_fixed_fee)
      .sort((a, b) => (b.fixed_fee || 0) + (b.saved_commission || 0) + b.month_sales - ((a.fixed_fee || 0) + (a.saved_commission || 0) + a.month_sales))

    // Liste complète (pour le sélecteur "ajouter une influenceuse")
    const all_influencers = all
      .map((r) => ({ id: r.influencer_id, name: r.name, commission_rate: r.commission_rate }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ period: { year, month }, rows, all_influencers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// POST — enregistre les coûts d'un mois. Body :
//   { month, year, entries: [{ influencer_id, fixed_fee, commission }] }
// fixed_fee / commission : nombre = upsert ; vide/null = on efface ce coût pour ce mois.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const month = Number(body.month)
    const year = Number(body.year)
    const entries: any[] = Array.isArray(body.entries) ? body.entries : []
    if (!month || !year || entries.length === 0) {
      return NextResponse.json({ error: "month, year, entries requis" }, { status: 400 })
    }

    const num = (v: any) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))

    const feeUpserts: any[] = []
    const commUpserts: any[] = []
    const feeClear: string[] = []
    const commClear: string[] = []

    for (const e of entries) {
      if (!e.influencer_id) continue
      const fee = num(e.fixed_fee)
      const comm = num(e.commission)
      if (fee != null) feeUpserts.push({ influencer_id: e.influencer_id, amount: fee, month, year })
      else feeClear.push(e.influencer_id)
      if (comm != null) commUpserts.push({ influencer_id: e.influencer_id, amount: comm, month, year })
      else commClear.push(e.influencer_id)
    }

    if (feeUpserts.length)
      await supabase.from("influencer_fixed_fees").upsert(feeUpserts, { onConflict: "influencer_id,year,month" })
    if (commUpserts.length)
      await supabase.from("influencer_commissions").upsert(commUpserts, { onConflict: "influencer_id,year,month" })
    if (feeClear.length)
      await supabase.from("influencer_fixed_fees").delete().eq("year", year).eq("month", month).in("influencer_id", feeClear)
    if (commClear.length)
      await supabase.from("influencer_commissions").delete().eq("year", year).eq("month", month).in("influencer_id", commClear)

    // Recalcul des totaux par influenceuse touchée (cohérent avec /fees)
    const feeTouched = Array.from(new Set([...feeUpserts.map((f) => f.influencer_id), ...feeClear]))
    const commTouched = Array.from(new Set([...commUpserts.map((c) => c.influencer_id), ...commClear]))

    for (const id of feeTouched) {
      const { data } = await supabase.from("influencer_fixed_fees").select("amount").eq("influencer_id", id)
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      await supabase.from("influencers").update({ total_fixed_fees: total, has_fixed_fee: total > 0 }).eq("id", id)
    }
    for (const id of commTouched) {
      const { data } = await supabase.from("influencer_commissions").select("amount").eq("influencer_id", id)
      const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      await supabase.from("influencers").update({ total_commissions: total }).eq("id", id)
    }

    return NextResponse.json({ success: true, fees: feeUpserts.length, commissions: commUpserts.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
