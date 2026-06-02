import { NextResponse } from "next/server"
import { getUncategorizedCodes } from "@/lib/codes-server"

export const dynamic = "force-dynamic"

// Codes promo non catégorisés (matching normalisé — cf src/lib/codes-server.ts).
// Source de vérité de la catégorisation = table influencer_codes.code_type.
export async function GET() {
  try {
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
