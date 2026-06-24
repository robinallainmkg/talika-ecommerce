import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { syncMonthlyCampaign } from "@/lib/influence/monthly-campaign"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// POST { year?, month? } → (re)synchronise la campagne du mois depuis les coûts/ventes.
// Sans paramètres : mois courant. Idempotent.
export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const now = new Date()
    const year = Number(b.year) || now.getFullYear()
    const month = Number(b.month) || now.getMonth() + 1
    if (month < 1 || month > 12) return NextResponse.json({ error: "mois invalide" }, { status: 400 })
    const result = await syncMonthlyCampaign(supabase, year, month)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
