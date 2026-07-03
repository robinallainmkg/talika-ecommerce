import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET: list all P&L lines for a year
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || "2026")

  const { data, error } = await supabase
    .from("pnl_lines")
    .select("*")
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("month", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data })
}

// POST: upsert a P&L line (create or update amount).
// `parent` ("" = ligne de tête, sinon nom du groupe parent). Une création/saisie
// manuelle vaut source:"manual" par défaut.
export async function POST(request: Request) {
  const body = await request.json()
  const { category, subcategory, month, year, amount, source, sort_order, parent } = body

  if (!category || !subcategory || !month || !year) {
    return NextResponse.json({ error: "category, subcategory, month, year requis" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("pnl_lines")
    .upsert(
      {
        category,
        parent: parent ?? "",
        subcategory,
        month,
        year,
        amount: amount ?? 0,
        source: source || "manual",
        sort_order: sort_order ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category,parent,subcategory,month,year" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line: data })
}

// PATCH: édition d'une cellule par id.
//  - { id, amount }        → saisie manuelle : FIGE la cellule (source:"manual")
//                            pour que la sync auto ne la réécrive plus jamais.
//  - { id, source:"auto" } → "↺ auto" : réactive le calcul auto (la prochaine
//                            sync repeuplera la valeur).
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, amount, source } = body

  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (source === "auto") {
    patch.source = "auto"
  } else {
    patch.amount = amount
    patch.source = "manual"
  }

  const { data, error } = await supabase
    .from("pnl_lines")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line: data })
}

// DELETE: remove a full subcategory row (all months) or a specific line
export async function DELETE(request: Request) {
  const body = await request.json()
  const { id, category, subcategory, year, parent, deleteGroup } = body

  if (id) {
    // Delete single line (one cell)
    const { error } = await supabase.from("pnl_lines").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (deleteGroup && category && parent && year) {
    // Delete a whole group: all detail rows whose parent = this group label
    const { error } = await supabase
      .from("pnl_lines")
      .delete()
      .eq("category", category)
      .eq("parent", parent)
      .eq("year", year)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (category && subcategory && year) {
    // Delete all months for this subcategory (within its parent group, "" = top-level)
    const { error } = await supabase
      .from("pnl_lines")
      .delete()
      .eq("category", category)
      .eq("parent", parent ?? "")
      .eq("subcategory", subcategory)
      .eq("year", year)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "id, groupe, ou (category, subcategory, year) requis" }, { status: 400 })
}
