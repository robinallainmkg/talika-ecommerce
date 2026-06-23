import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSessionUser } from "@/lib/auth/server"
import { BILLING_STATUSES } from "@/lib/influence/billing-status"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// POST — change le statut de facturation d'une collab (influenceuse × mois).
// Body: { influencer_id, year, month, status, deferred_to?:{year,month}, note? }
// status='a_regler' ⇒ on supprime la ligne (retour au défaut, réversible).
// Mois verrouillé ⇒ édition refusée (423) SAUF admin (même garde que /commissions).
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const influencer_id = body.influencer_id as string
  const year = Number(body.year)
  const month = Number(body.month)
  const status = body.status as string
  if (!influencer_id || !year || !month || !BILLING_STATUSES.includes(status as never)) {
    return NextResponse.json({ error: "params invalides" }, { status: 400 })
  }

  // Verrou de mois : édition bloquée sauf admin.
  const { data: lock } = await supabase
    .from("influence_month_locks")
    .select("locked_by")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle()
  if (lock && (user.user_metadata?.role as string) !== "admin") {
    return NextResponse.json(
      { error: "Mois verrouillé — seul un admin peut éditer.", locked: true },
      { status: 423 }
    )
  }

  // Retour au défaut = suppression de la ligne.
  if (status === "a_regler") {
    const { error } = await supabase
      .from("influence_billing_status")
      .delete()
      .eq("influencer_id", influencer_id)
      .eq("year", year)
      .eq("month", month)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: "a_regler" })
  }

  const deferredY = status === "reporte" ? Number(body.deferred_to?.year) || null : null
  const deferredM = status === "reporte" ? Number(body.deferred_to?.month) || null : null

  const { error } = await supabase.from("influence_billing_status").upsert(
    {
      influencer_id,
      year,
      month,
      status,
      deferred_to_year: deferredY,
      deferred_to_month: deferredM,
      note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
      updated_by: user.email || "?",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "influencer_id,year,month" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
