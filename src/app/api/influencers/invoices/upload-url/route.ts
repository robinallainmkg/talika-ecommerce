import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BUCKET = "influencer-invoices"
const MAX_SIZE = 15 * 1024 * 1024
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

// Crée la ligne facture + une URL d'upload signée (même patron que la KB chat).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const fileName = (body.file_name || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150)
    const mime = body.mime_type as string
    const size = Number(body.size_bytes) || 0

    if (!body.influencer_id || !fileName) {
      return NextResponse.json({ error: "influencer_id et file_name requis" }, { status: 400 })
    }
    if (!ALLOWED.includes(mime)) {
      return NextResponse.json({ error: "type non supporté (pdf, jpg, png, webp)" }, { status: 400 })
    }
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: "fichier trop volumineux (max 15 Mo)" }, { status: 400 })
    }

    const { data: row, error } = await supabase
      .from("influencer_cost_invoices")
      .insert({
        influencer_id: body.influencer_id,
        year: body.year || null,
        month: body.month || null,
        kind: body.kind || "fee",
        file_name: fileName,
        mime_type: mime,
        size_bytes: size,
        uploaded_by: body.uploaded_by || null,
      })
      .select("id")
      .single()
    if (error || !row) {
      return NextResponse.json({ error: error?.message || "insert failed" }, { status: 500 })
    }

    const path = `${row.id}/${fileName}`
    await supabase.from("influencer_cost_invoices").update({ storage_path: path }).eq("id", row.id)

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (signErr || !signed) {
      return NextResponse.json({ error: signErr?.message || "signed url failed" }, { status: 500 })
    }

    return NextResponse.json({
      invoice_id: row.id,
      bucket: BUCKET,
      path,
      upload_url: signed.signedUrl,
      token: signed.token,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
