/**
 * POST /api/sync/all
 *
 * "Tout synchroniser" — déclenché par le bouton du dashboard. Protégé par la
 * session Supabase (middleware) : seul un utilisateur connecté peut l'appeler.
 * Utilise EXACTEMENT le même code que le cron (runFullSync), avec le budget de
 * 5 min nécessaire aux sources lentes (Klaviyo, Meta, objectifs).
 */
import { NextResponse } from "next/server"
import { runFullSync } from "@/lib/sync/run-all"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 min max (Vercel Pro)

export async function POST() {
  try {
    const result = await runFullSync({ trigger: "manual" })
    return NextResponse.json(result, { status: result.success ? 200 : 207 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
