/**
 * GET /api/cron/daily
 *
 * Vercel Cron job — tourne chaque jour à 7h UTC (cf vercel.json).
 * Délègue tout le travail à runFullSync() (lib/sync/run-all.ts), exactement le
 * même code que le bouton "Tout synchroniser" du dashboard (POST /api/sync/all).
 *
 * Protégé par CRON_SECRET. ⚠️ Vercel n'ajoute l'en-tête Authorization: Bearer
 * <CRON_SECRET> aux invocations cron QUE si la variable CRON_SECRET existe dans
 * les env Vercel (Production). Sans elle, le cron renvoie 401 à chaque run.
 */
import { NextResponse } from "next/server"
import { runFullSync } from "@/lib/sync/run-all"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min max (Vercel Pro)

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runFullSync({ trigger: "cron" })
    return NextResponse.json(result, { status: result.success ? 200 : 207 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
