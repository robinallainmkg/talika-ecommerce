import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { ALLOWED_KB_MIMES } from "@/lib/chat/extract"

export const dynamic = "force-dynamic"

const MAX_SIZE = 25 * 1024 * 1024

export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const fileName = (body.file_name || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150)
    const mimeType = body.mime_type as string
    const sizeBytes = Number(body.size_bytes) || 0

    if (!fileName || !ALLOWED_KB_MIMES.includes(mimeType)) {
      return NextResponse.json({ error: "type de fichier non supporté (pdf, docx, md, txt)" }, { status: 400 })
    }
    if (sizeBytes > MAX_SIZE) {
      return NextResponse.json({ error: "fichier trop volumineux (max 25 Mo)" }, { status: 400 })
    }

    const db = chatDb()
    const { data: doc, error } = await db
      .from("kb_documents")
      .insert({
        source_type: "upload",
        title: (body.title as string) || fileName,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        tags: Array.isArray(body.tags) ? body.tags : [],
        status: "processing",
      })
      .select("id")
      .single()
    if (error || !doc) {
      return NextResponse.json({ error: error?.message || "insert failed" }, { status: 500 })
    }

    const path = `${doc.id}/${fileName}`
    await db.from("kb_documents").update({ storage_path: path }).eq("id", doc.id)

    const { data: signed, error: signError } = await db.storage
      .from("kb-files")
      .createSignedUploadUrl(path)
    if (signError || !signed) {
      return NextResponse.json({ error: signError?.message || "signed url failed" }, { status: 500 })
    }

    return NextResponse.json({
      document_id: doc.id,
      path,
      upload_url: signed.signedUrl,
      token: signed.token,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
