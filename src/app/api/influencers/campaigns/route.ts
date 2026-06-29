import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizeMarket } from "@/lib/market"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET — liste des campagnes du marché (+ nb d'influenceuses par campagne)
export async function GET(request: Request) {
  try {
    const market = normalizeMarket(new URL(request.url).searchParams.get("market"))
    const { data: campaigns } = await supabase
      .from("influence_campaigns")
      .select("*")
      .eq("market", market)
      .order("created_at", { ascending: false })
    const { data: collabs } = await supabase
      .from("influence_campaign_collabs")
      .select("campaign_id")
    const counts: Record<string, number> = {}
    for (const c of collabs || []) counts[c.campaign_id] = (counts[c.campaign_id] || 0) + 1
    return NextResponse.json({
      campaigns: (campaigns || []).map((c) => ({ ...c, collab_count: counts[c.id] || 0 })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

const NUM = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))
const STR = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const ARR = (v: unknown) =>
  Array.isArray(v) ? v.filter((t) => typeof t === "string" && t.trim()).map((t) => (t as string).trim()) : []
// Dernier jour du mois (au format YYYY-MM-DD)
const monthEnd = (y: number, m: number) => new Date(y, m, 0).toISOString().slice(0, 10)

// POST — créer une campagne (mensuelle si year/month fournis)
export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (!STR(b.name)) return NextResponse.json({ error: "nom requis" }, { status: 400 })
    const year = NUM(b.year)
    const month = NUM(b.month)
    const themes = ARR(b.themes)
    // Pour une campagne mensuelle, les dates se déduisent du mois si non fournies.
    const start = STR(b.start_date) || (year && month ? `${year}-${String(month).padStart(2, "0")}-01` : null)
    const end = STR(b.end_date) || (year && month ? monthEnd(year, month) : null)
    const { data, error } = await supabase
      .from("influence_campaigns")
      .insert({
        name: b.name.trim(),
        market: normalizeMarket(b.market),
        year, month, themes,
        theme: themes.length ? themes.join(", ") : STR(b.theme), // compat ancien champ
        objective: STR(b.objective),
        start_date: start,
        end_date: end,
        budget: NUM(b.budget),
        notes: STR(b.notes),
      })
      .select("*")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ campaign: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// PATCH — éditer une campagne
export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
    const fields: Record<string, unknown> = {}
    for (const k of ["name", "objective", "start_date", "end_date", "notes", "status"]) {
      if (k in b) fields[k] = STR(b[k])
    }
    if ("budget" in b) fields.budget = NUM(b.budget)
    if ("year" in b) fields.year = NUM(b.year)
    if ("month" in b) fields.month = NUM(b.month)
    if ("themes" in b) {
      const themes = ARR(b.themes)
      fields.themes = themes
      fields.theme = themes.join(", ") // garde l'ancien champ cohérent
    }
    const { error } = await supabase.from("influence_campaigns").update(fields).eq("id", b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// DELETE — supprimer une campagne (cascade sur les collabs)
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
    const { error } = await supabase.from("influence_campaigns").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
