import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { syncPnLAuto } from "@/lib/sync/pnl-auto"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// POST ?year=YYYY — (re)calcule les lignes auto du P&L pour l'année donnée.
// Ne touche jamais les cellules passées en manuel (cf. syncPnLAuto).
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))

  try {
    const result = await syncPnLAuto(supabase, year)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "erreur inconnue" },
      { status: 500 }
    )
  }
}
