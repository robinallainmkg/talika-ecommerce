import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { ingestDocument } from "@/lib/chat/ingest"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    await db.from("kb_documents").update({ status: "processing", error_message: null }).eq("id", params.id)
    const result = await ingestDocument(db, params.id)
    return NextResponse.json({ ok: true, chunk_count: result.chunkCount })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
