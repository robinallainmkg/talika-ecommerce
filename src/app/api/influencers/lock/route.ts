import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminUser } from "@/lib/auth/server"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Verrouillage de fin de mois des coûts influence.
// Présence d'une ligne = mois verrouillé. Verrouiller ET déverrouiller = admin
// uniquement : figer un mois arrête les montants qui alimentent le P&L et le
// media_spent, c'est une décision de clôture (l'agente influence continue de
// travailler sur ses factures après, cf. /api/influencers/billing/status).
//
// Ce que le verrou fige = les MONTANTS SEULEMENT :
//   - commissions / forfaits (/api/influencers/commissions)
//   - le statut "sans_facturation", qui retire un coût du total du mois
// Ce qu'il laisse ouvert : joindre/supprimer les factures, et le suivi de
// paiement (à régler / reporté / payé).
//
// ⚠️ Pas de colonne `market` : un verrou vaut pour TOUS les marchés (FR + UK).

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || "0")
  const month = parseInt(searchParams.get("month") || "0")
  const { data } = await supabase
    .from("influence_month_locks")
    .select("year, month, locked_by, locked_at")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle()
  return NextResponse.json({ locked: !!data, lock: data || null })
}

export async function POST(request: Request) {
  // Verrouillage = admin uniquement (même règle que le déverrouillage).
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const user = auth.user

  const body = await request.json().catch(() => ({}))
  const year = Number(body.year)
  const month = Number(body.month)
  if (!year || !month) {
    return NextResponse.json({ error: "year, month requis" }, { status: 400 })
  }

  const { error } = await supabase.from("influence_month_locks").upsert(
    { year, month, locked_by: user.email || "?", locked_at: new Date().toISOString() },
    { onConflict: "year,month" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locked: true, locked_by: user.email })
}

export async function DELETE(request: Request) {
  // Déverrouillage = admin uniquement.
  const auth = await requireAdminUser()
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const year = Number(body.year)
  const month = Number(body.month)
  if (!year || !month) {
    return NextResponse.json({ error: "year, month requis" }, { status: 400 })
  }

  const { error } = await supabase
    .from("influence_month_locks")
    .delete()
    .eq("year", year)
    .eq("month", month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locked: false })
}
