import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSessionUser } from "@/lib/auth/server"
import { marketFromRequest } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

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
    // Scope marché (cookie tk_market / ?market=) : en UK on ne montre QUE les
    // influenceuses UK (sinon les coûts FR fuient dans la vue UK).
    const market = marketFromRequest(request)

    const [{ data: influencers }, { data: sales }, { data: savedComm }, { data: fees }, { data: rates }] =
      await Promise.all([
        supabase.from("influencers").select("id, name, commission_rate, has_fixed_fee, status").eq("market", market),
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
        supabase
          .from("influencer_commission_rates")
          .select("influencer_id, year, month, rate"),
      ])

    const salesByInf: Record<string, number> = {}
    for (const s of sales || []) {
      salesByInf[s.influencer_id] = (salesByInf[s.influencer_id] || 0) + Number(s.line_price || 0)
    }
    const savedByInf: Record<string, number> = {}
    for (const c of savedComm || []) savedByInf[c.influencer_id] = Number(c.amount || 0)
    const feeByInf: Record<string, number> = {}
    for (const f of fees || []) feeByInf[f.influencer_id] = Number(f.amount || 0)

    // Taux effectif = dernier taux saisi <= (year,month) (report auto du mois
    // précédent), sinon le taux attaché à l'influ. rate_explicit = saisi CE mois-ci.
    const targetP = year * 12 + (month - 1)
    const rateByInf: Record<string, { rate: number; period: number }> = {}
    for (const r of rates || []) {
      const p = Number(r.year) * 12 + (Number(r.month) - 1)
      if (p > targetP) continue
      const cur = rateByInf[r.influencer_id]
      if (!cur || p > cur.period) rateByInf[r.influencer_id] = { rate: Number(r.rate) || 0, period: p }
    }

    const all = (influencers || []).map((inf) => {
      const monthSales = salesByInf[inf.id] || 0
      const resolved = rateByInf[inf.id]
      const rate = resolved ? resolved.rate : (Number(inf.commission_rate) || 0)
      return {
        influencer_id: inf.id,
        name: inf.name,
        commission_rate: rate,
        rate_explicit: !!resolved && resolved.period === targetP,
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

    const user = await getSessionUser()

    // Mois verrouillé : édition bloquée, SAUF pour l'admin (qui garde la main).
    const { data: lock } = await supabase
      .from("influence_month_locks")
      .select("locked_by")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()
    if (lock && (user?.user_metadata?.role as string) !== "admin") {
      return NextResponse.json(
        { error: "Mois verrouillé — seul un admin peut éditer.", locked: true },
        { status: 423 }
      )
    }

    const num = (v: any) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))

    const feeUpserts: any[] = []
    const commUpserts: any[] = []
    const feeClear: string[] = []
    const commClear: string[] = []
    const rateUpserts: any[] = []
    const rateClear: string[] = []

    for (const e of entries) {
      if (!e.influencer_id) continue
      const fee = num(e.fixed_fee)
      const comm = num(e.commission)
      if (fee != null) feeUpserts.push({ influencer_id: e.influencer_id, amount: fee, month, year })
      else feeClear.push(e.influencer_id)
      if (comm != null) commUpserts.push({ influencer_id: e.influencer_id, amount: comm, month, year })
      else commClear.push(e.influencer_id)
      // Le taux n'est touché QUE s'il est explicitement envoyé (l'UI ne l'envoie
      // que si l'utilisateur l'a modifié). Présent + vide = on efface l'override
      // de ce mois (retour au report/au taux de l'influ).
      if ("rate" in e) {
        const rt = num(e.rate)
        if (rt != null) rateUpserts.push({ influencer_id: e.influencer_id, year, month, rate: rt, updated_by: user?.email ?? null })
        else rateClear.push(e.influencer_id)
      }
    }

    if (feeUpserts.length)
      await supabase.from("influencer_fixed_fees").upsert(feeUpserts, { onConflict: "influencer_id,year,month" })
    if (commUpserts.length)
      await supabase.from("influencer_commissions").upsert(commUpserts, { onConflict: "influencer_id,year,month" })
    if (feeClear.length)
      await supabase.from("influencer_fixed_fees").delete().eq("year", year).eq("month", month).in("influencer_id", feeClear)
    if (commClear.length)
      await supabase.from("influencer_commissions").delete().eq("year", year).eq("month", month).in("influencer_id", commClear)
    if (rateUpserts.length)
      await supabase.from("influencer_commission_rates").upsert(rateUpserts, { onConflict: "influencer_id,year,month" })
    if (rateClear.length)
      await supabase.from("influencer_commission_rates").delete().eq("year", year).eq("month", month).in("influencer_id", rateClear)

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
