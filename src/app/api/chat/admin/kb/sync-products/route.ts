import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { syncProducts } from "@/lib/chat/shopify-products"
import { syncThemeFaqs } from "@/lib/chat/theme-faqs"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300

export async function POST(request: Request) {
  const denied = requireAdmin(request)
  if (denied) return denied
  try {
    const db = chatDb()
    const result = await syncProducts(db)
    // FAQ saisies dans l'éditeur de thème (templates produit) : indexées dans la
    // même passe — sans elles le bot ignore les réponses officielles publiées.
    let themeFaqs = null
    try {
      themeFaqs = await syncThemeFaqs(db)
    } catch (err) {
      themeFaqs = { error: (err as Error).message }
    }
    return NextResponse.json({ ...result, theme_faqs: themeFaqs })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
