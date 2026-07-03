import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKET = "influencer-videos"
const MAX_SIZE = 1024 * 1024 * 1024 // 1 Go (⚠ vérifier aussi la limite globale Storage du projet)

// Crée la ligne asset + une URL d'upload signée (même patron que documents/factures).
// Sert aux vidéos HD envoyées par les influenceuses (matière pour les ads Meta).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const fileName = (body.file_name || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150)
    const size = Number(body.size_bytes) || 0
    if (!body.influencer_id || !fileName) {
      return NextResponse.json({ error: "influencer_id et file_name requis" }, { status: 400 })
    }
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: "fichier trop volumineux (max 1 Go)" }, { status: 400 })
    }

    const { data: row, error } = await supabase
      .from("influencer_assets")
      .insert({
        influencer_id: body.influencer_id,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 150) : fileName.replace(/\.[^.]+$/, ""),
        file_name: fileName,
        mime_type: (body.mime_type as string) || "application/octet-stream",
        size_bytes: size,
        uploaded_by: body.uploaded_by || null,
      })
      .select("id")
      .single()
    if (error || !row) {
      return NextResponse.json({ error: error?.message || "insert failed" }, { status: 500 })
    }

    const path = `${row.id}/${fileName}`
    await supabase.from("influencer_assets").update({ storage_path: path }).eq("id", row.id)

    const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (signErr || !signed) {
      return NextResponse.json({ error: signErr?.message || "signed url failed" }, { status: 500 })
    }
    return NextResponse.json({ asset_id: row.id, bucket: BUCKET, path, token: signed.token })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
