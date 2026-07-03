import { NextResponse } from "next/server"
import { getUncategorizedCodes } from "@/lib/codes-server"
import { marketFromRequest } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

// Codes promo non catégorisés (matching normalisé — cf src/lib/codes-server.ts).
// Source de vérité de la catégorisation = table influencer_codes.code_type.
export async function GET(request: Request) {
  try {
    // Codes = data Shopify FR → hors FR, rien à catégoriser.
    if (marketFromRequest(request) !== "FR") {
      return NextResponse.json({ codes: [] })
    }
    const now = new Date()
    const codes = await getUncategorizedCodes(now.getFullYear(), now.getMonth() + 1)
    return NextResponse.json({ codes })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
