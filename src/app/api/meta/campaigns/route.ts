import { NextResponse } from "next/server"
import { getCampaigns, getAccountInsights } from "@/lib/integrations/meta"

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
