import { NextResponse } from "next/server"
import { getCampaigns, getAccountInsights } from "@/lib/integrations/meta"

// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
// Cette route etait meme prerendue en statique au build (reponse Meta figee).
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    const [campaigns, insights] = await Promise.all([
      getCampaigns(),
      getAccountInsights(),
    ])
    return NextResponse.json({ campaigns, insights })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Meta data" },
      { status: 500 }
    )
  }
}
