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

const BUCKET = "influencer-documents"

// GET ?influencer_id= → liste des documents d'une influenceuse
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("influencer_id")
  if (!id) return NextResponse.json({ documents: [] })
  const { data, error } = await supabase
    .from("influencer_documents")
    .select("id, label, file_name, mime_type, size_bytes, created_at")
    .eq("influencer_id", id)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data || [] })
}

// POST { id } → URL signée de consultation
export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: row } = await supabase.from("influencer_documents").select("storage_path").eq("id", id).single()
  if (!row?.storage_path) return NextResponse.json({ error: "introuvable" }, { status: 404 })
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 300)
  return NextResponse.json({ url: signed?.signedUrl || null })
}

// DELETE { id } → supprime le fichier + la ligne
export async function DELETE(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: row } = await supabase.from("influencer_documents").select("storage_path").eq("id", id).single()
  if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await supabase.from("influencer_documents").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
