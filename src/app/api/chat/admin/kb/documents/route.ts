import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const [{ data: documents, error }, { data: lastSync }] = await Promise.all([
      db
        .from("kb_documents")
        .select(
          "id, source_type, title, file_name, mime_type, size_bytes, status, error_message, chunk_count, tags, created_at, indexed_at"
        )
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("kb_documents")
        .select("indexed_at")
        .eq("source_type", "shopify_product")
        .not("indexed_at", "is", null)
        .order("indexed_at", { ascending: false })
        .limit(1)
        .single(),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      documents: documents || [],
      products_last_sync: lastSync?.indexed_at || null,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
