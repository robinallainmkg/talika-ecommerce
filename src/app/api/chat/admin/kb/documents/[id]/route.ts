import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const { data: doc } = await db
      .from("kb_documents")
      .select("storage_path")
      .eq("id", params.id)
      .single()
    if (doc?.storage_path) {
      await db.storage.from("kb-files").remove([doc.storage_path])
    }
    const { error } = await db.from("kb_documents").delete().eq("id", params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
