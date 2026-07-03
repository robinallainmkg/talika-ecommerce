import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const { data: chunks, error } = await chatDb()
      .from("kb_chunks")
      .select("id, chunk_index, section_heading, content, metadata")
      .eq("document_id", params.id)
      .order("chunk_index", { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ chunks: chunks || [] })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
