import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const pad = (n: number) => String(n).padStart(2, "0")

// GET ?year=&month= — Écran "Coûts du mois" : par influenceuse, ses ventes du mois
// (via les codes), la commission SUGGÉRÉE (commission_rate % × ventes) et la valeur
// déjà saisie. Plus besoin de taper : le système calcule depuis influencer_product_sales.
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
        supabase.from("influencers").select("id, name, commission_rate, status"),
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
          .select("influencer_id, amount, label")
          .eq("year", year)
          .eq("month", month),
      ])

    const salesByInf: Record<string, number> = {}
    for (const s of sales || []) {
      salesByInf[s.influencer_id] = (salesByInf[s.influencer_id] || 0) + Number(s.line_price || 0)
    }
    const savedByInf: Record<string, number> = {}
    for (const c of savedComm || []) savedByInf[c.influencer_id] = Number(c.amount || 0)
    const feeByInf: Record<string, { amount: number; label: string | null }> = {}
    for (const f of fees || []) feeByInf[f.influencer_id] = { amount: Number(f.amount || 0), label: f.label }

    const rows = (influencers || [])
      .map((inf) => {
        const monthSales = salesByInf[inf.id] || 0
        const rate = Number(inf.commission_rate) || 0
        const suggested = rate > 0 ? Math.round((monthSales * rate) / 100 * 100) / 100 : null
        return {
          influencer_id: inf.id,
          name: inf.name,
          status: inf.status,
          commission_rate: rate,
          month_sales: Math.round(monthSales * 100) / 100,
          suggested_commission: suggested,
          saved_commission: inf.id in savedByInf ? savedByInf[inf.id] : null,
          fixed_fee: feeByInf[inf.id]?.amount ?? null,
          fixed_fee_label: feeByInf[inf.id]?.label ?? null,
        }
      })
      // On garde les influenceuses pertinentes ce mois-ci : taux de commission,
      // ou ventes, ou un coût déjà saisi.
      .filter(
        (r) =>
          r.commission_rate > 0 ||
          r.month_sales > 0 ||
          r.saved_commission != null ||
          r.fixed_fee != null
      )
      .sort((a, b) => b.month_sales - a.month_sales)

    return NextResponse.json({ period: { year, month }, rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}

// POST — enregistre une ou plusieurs commissions (upsert idempotent).
// Body : { influencer_id, amount, month, year }  OU  { entries: [{influencer_id, amount, month, year}] }
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const entries: any[] = Array.isArray(body.entries)
      ? body.entries
      : [body]

    const valid = entries.filter(
      (e) => e.influencer_id && e.month && e.year && e.amount != null
    )
    if (valid.length === 0) {
      return NextResponse.json(
        { error: "influencer_id, amount, month, year requis" },
        { status: 400 }
      )
    }

    const { error } = await supabase.from("influencer_commissions").upsert(
      valid.map((e) => ({
        influencer_id: e.influencer_id,
        amount: Number(e.amount),
        month: Number(e.month),
        year: Number(e.year),
      })),
      { onConflict: "influencer_id,year,month" }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Recalcul total_commissions par influenceuse touchée (cohérent avec /fees)
    const touched = Array.from(new Set(valid.map((e) => e.influencer_id)))
    for (const id of touched) {
      const { data: all } = await supabase
        .from("influencer_commissions")
        .select("amount")
        .eq("influencer_id", id)
      const total = (all || []).reduce((s, r) => s + Number(r.amount || 0), 0)
      await supabase.from("influencers").update({ total_commissions: total }).eq("id", id)
    }

    return NextResponse.json({ success: true, saved: valid.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    )
  }
}
