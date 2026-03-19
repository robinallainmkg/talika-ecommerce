import { NextResponse } from "next/server"
import { getFlows, getCampaigns as getKlaviyoCampaigns } from "@/lib/integrations/klaviyo"

export async function GET() {
  try {
    const [flows, campaigns] = await Promise.all([
      getFlows(),
      getKlaviyoCampaigns(),
    ])
    return NextResponse.json({ flows, campaigns })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Klaviyo data" },
      { status: 500 }
    )
  }
}
