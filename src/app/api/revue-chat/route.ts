import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

// Page de revue TEMPORAIRE (publique, non indexée) : les 8 conversations du
// 2-3 juillet 2026, partagées avec une collaboratrice pour recueillir ses notes.
// Les notes vivent dans data_cache (clé unique) — pas de table dédiée.
// À retirer après la revue (page + entrées middleware + cette route).

const CONV_IDS = [
  "90536e61-e5ba-4f03-9659-62f844e86b76",
  "473704c7-9407-4975-81fc-935dd2c3bcc4",
  "f870fd2e-8842-4d50-8d60-d48656ad71d8",
  "cf8c036a-fac0-4215-8afa-01972cdc2109",
  "4160bc00-c369-476d-a156-966d132cf364",
  "e9f35f19-4f05-44b3-a239-14ca48148b13",
  "5aeb1433-fb56-4c9c-9f69-1f1fe4e45147",
  "3bcda9b5-05bf-4dee-bfc9-bd49050eefd3",
]

const NOTES_KEY = "revue_chat_notes_2026_07"
const MAX_NOTES = 200

type Note = { author: string; conv_id: string | null; text: string; at: string }

// Email jamais exposé en clair sur une page publique.
function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split("@")
  if (!domain) return "•••"
  return `${local.slice(0, 2)}•••@${domain}`
}

export async function GET() {
  try {
    const db = chatDb()
    const [{ data: convs }, { data: msgs }, { data: notesRow }] = await Promise.all([
      db
        .from("chat_conversations")
        .select("id, status, visitor_email, customer_orders_count, created_at")
        .in("id", CONV_IDS),
      db
        .from("chat_messages")
        .select("conversation_id, role, content, product_refs, created_at")
        .in("conversation_id", CONV_IDS)
        .order("created_at", { ascending: true }),
      db.from("data_cache").select("data").eq("key", NOTES_KEY).maybeSingle(),
    ])

    const conversations = CONV_IDS.map((id) => {
      const c = (convs || []).find((x) => x.id === id)
      if (!c) return null
      return {
        id: c.id,
        status: c.status,
        email_masked: maskEmail(c.visitor_email),
        orders_count: c.customer_orders_count || 0,
        created_at: c.created_at,
        messages: (msgs || [])
          .filter((m) => m.conversation_id === id)
          .map((m) => ({
            role: m.role,
            content: m.content,
            product_refs: m.product_refs,
            created_at: m.created_at,
          })),
      }
    }).filter(Boolean)

    const notes: Note[] = (notesRow?.data as { notes?: Note[] } | null)?.notes || []
    return NextResponse.json({ conversations, notes })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const author = typeof body.author === "string" ? body.author.trim().slice(0, 60) : ""
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : ""
    const convId =
      typeof body.conv_id === "string" && CONV_IDS.includes(body.conv_id) ? body.conv_id : null
    if (!author || !text) {
      return NextResponse.json({ error: "nom et note requis" }, { status: 400 })
    }

    const db = chatDb()
    const { data: row } = await db.from("data_cache").select("data").eq("key", NOTES_KEY).maybeSingle()
    const notes: Note[] = (row?.data as { notes?: Note[] } | null)?.notes || []
    if (notes.length >= MAX_NOTES) {
      return NextResponse.json({ error: "limite de notes atteinte" }, { status: 429 })
    }
    notes.push({ author, conv_id: convId, text, at: new Date().toISOString() })
    const { error } = await db
      .from("data_cache")
      .upsert(
        { key: NOTES_KEY, data: { notes }, source: "revue_chat", updated_at: new Date().toISOString() },
        { onConflict: "key" }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, notes })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
