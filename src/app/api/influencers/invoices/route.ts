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

const BUCKET = "influencer-invoices"

// GET ?year=&month=  → factures du mois (toutes influenceuses)
// GET ?influencer_id= → factures d'une influenceuse
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get("influencer_id")
  const year = searchParams.get("year")
  const month = searchParams.get("month")

  let query = supabase
    .from("influencer_cost_invoices")
    .select("id, influencer_id, year, month, kind, amount, file_name, ocr, created_at")
    .order("created_at", { ascending: false })

  if (influencerId) query = query.eq("influencer_id", influencerId)
  if (year) query = query.eq("year", parseInt(year))
  if (month) query = query.eq("month", parseInt(month))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data || [] })
}

// DELETE { id } → supprime le fichier + la ligne
export async function DELETE(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })

  const { data: row } = await supabase
    .from("influencer_cost_invoices")
    .select("storage_path")
    .eq("id", id)
    .single()
  if (row?.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path])
  }
  const { error } = await supabase.from("influencer_cost_invoices").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Lien de téléchargement signé (consultation)
export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: row } = await supabase
    .from("influencer_cost_invoices")
    .select("storage_path")
    .eq("id", id)
    .single()
  if (!row?.storage_path) return NextResponse.json({ error: "introuvable" }, { status: 404 })
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, 300)
  return NextResponse.json({ url: signed?.signedUrl || null })
}
