import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET — liste des campagnes (+ nb d'influenceuses par campagne)
export async function GET() {
  try {
    const { data: campaigns } = await supabase
      .from("influence_campaigns")
      .select("*")
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

// POST — créer une campagne
export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (!STR(b.name)) return NextResponse.json({ error: "nom requis" }, { status: 400 })
    const { data, error } = await supabase
      .from("influence_campaigns")
      .insert({
        name: b.name.trim(),
        theme: STR(b.theme),
        objective: STR(b.objective),
        start_date: STR(b.start_date),
        end_date: STR(b.end_date),
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
    for (const k of ["name", "theme", "objective", "start_date", "end_date", "notes", "status"]) {
      if (k in b) fields[k] = STR(b[k])
    }
    if ("budget" in b) fields.budget = NUM(b.budget)
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
