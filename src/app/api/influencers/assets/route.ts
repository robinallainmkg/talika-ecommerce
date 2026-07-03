import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { marketFromRequest } from "@/lib/market"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKET = "influencer-videos"

// Vidéothèque HD (fichiers sources envoyés par les influenceuses) + code de
// publicité de partenariat Meta pour booster.

// GET ?influencer_id= (une influenceuse) ou liste globale scopée marché.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("influencer_id")
  let query = supabase
    .from("influencer_assets")
    .select("id, influencer_id, label, file_name, mime_type, size_bytes, partnership_ad_code, notes, created_at, influencers!inner(id, name, market)")
    .order("created_at", { ascending: false })
  if (id) query = query.eq("influencer_id", id)
  else query = query.eq("influencers.market", marketFromRequest(request))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data || [] })
}

// POST { id } → URL signée de téléchargement (1 h — les vidéos sont lourdes).
export async function POST(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: row } = await supabase.from("influencer_assets").select("storage_path").eq("id", id).single()
  if (!row?.storage_path) return NextResponse.json({ error: "introuvable" }, { status: 404 })
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600)
  return NextResponse.json({ url: signed?.signedUrl || null })
}

// PATCH { id, partnership_ad_code?, label?, notes? } — édition inline.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const update: Record<string, unknown> = {}
  for (const k of ["partnership_ad_code", "label", "notes"] as const) {
    if (k in body) update[k] = typeof body[k] === "string" && body[k].trim() === "" ? null : body[k]
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "rien à mettre à jour" }, { status: 400 })
  const { error } = await supabase.from("influencer_assets").update(update).eq("id", body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { id } → supprime le fichier + la ligne.
export async function DELETE(request: Request) {
  const { id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  const { data: row } = await supabase.from("influencer_assets").select("storage_path").eq("id", id).single()
  if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await supabase.from("influencer_assets").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
