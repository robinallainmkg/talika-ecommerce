import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { syncPnLAuto } from "@/lib/sync/pnl-auto"

export const dynamic = "force-dynamic"
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
