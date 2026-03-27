import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

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

// POST: upsert a P&L line (create or update amount)
export async function POST(request: Request) {
  const body = await request.json()
  const { category, subcategory, month, year, amount, source, sort_order } = body

  if (!category || !subcategory || !month || !year) {
    return NextResponse.json({ error: "category, subcategory, month, year requis" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("pnl_lines")
    .upsert(
      {
        category,
        subcategory,
        month,
        year,
        amount: amount ?? 0,
        source: source || "manual",
        sort_order: sort_order ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "category,subcategory,month,year" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line: data })
}

// PATCH: update amount for a specific line by id
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, amount } = body

  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  const { data, error } = await supabase
    .from("pnl_lines")
    .update({ amount, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line: data })
}

// DELETE: remove a full subcategory row (all months) or a specific line
export async function DELETE(request: Request) {
  const body = await request.json()
  const { id, category, subcategory, year } = body

  if (id) {
    // Delete single line
    const { error } = await supabase.from("pnl_lines").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (category && subcategory && year) {
    // Delete all months for this subcategory
    const { error } = await supabase
      .from("pnl_lines")
      .delete()
      .eq("category", category)
      .eq("subcategory", subcategory)
      .eq("year", year)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "id ou (category, subcategory, year) requis" }, { status: 400 })
}
