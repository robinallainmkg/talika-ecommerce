import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Ventes nettes OFFICIELLES par code = rapport Shopify "Sales by discount".
// C'est la base de commission validée par Robin (sa feuille Excel vient de ce
// rapport). On ne peut PAS recalculer ces montants depuis l'API commandes :
// le rapport ventile chaque commande entre TOUS les discounts empilés (volume
// -10%/-15%/-20%, Cadeau offert, soldes…) avec sa propre logique interne
// (ShopifyQL retiré de l'API Admin). Donc : import du CSV du rapport, une fois
// par mois, et la page Coûts utilise ces montants quand ils existent.

// GET ?year=&month= → lignes importées du mois (par influenceuse)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || "0")
  const month = parseInt(searchParams.get("month") || "0")
  if (!year || !month) return NextResponse.json({ rows: [] })
  const { data, error } = await supabase
    .from("influencer_report_sales")
    .select("influencer_id, code, net_sales, imported_at")
    .eq("year", year)
    .eq("month", month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}

// POST { year, month, rows: [{ code, net_sales }] } — importe le rapport du mois.
// Ré-import = remplace le mois entier. Les codes inconnus (pas dans
// influencer_codes) sont ignorés et renvoyés pour information.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const year = parseInt(body.year)
    const month = parseInt(body.month)
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year/month requis" }, { status: 400 })
    }
    if (!rows.length) return NextResponse.json({ error: "rows vide" }, { status: 400 })

    // Mapping code → influenceuse (codes actifs ET inactifs : un code coupé
    // en cours de mois a quand même généré des ventes sur la période).
    const { data: codes } = await supabase
      .from("influencer_codes")
      .select("code, influencer_id")
    const codeMap = new Map((codes || []).map((c) => [c.code.toUpperCase().trim(), c.influencer_id]))

    const matched: { influencer_id: string; year: number; month: number; code: string; net_sales: number }[] = []
    const ignored: string[] = []
    for (const r of rows) {
      const code = String(r.code || "").toUpperCase().trim()
      const net = Number(r.net_sales)
      if (!code || !Number.isFinite(net)) continue
      const influencerId = codeMap.get(code)
      if (!influencerId) { ignored.push(code); continue }
      matched.push({ influencer_id: influencerId, year, month, code, net_sales: Math.round(net * 100) / 100 })
    }

    // Remplacement du mois (ré-import idempotent)
    await supabase.from("influencer_report_sales").delete().eq("year", year).eq("month", month)
    if (matched.length) {
      const { error } = await supabase.from("influencer_report_sales").insert(matched)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, imported: matched.length, ignored })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
