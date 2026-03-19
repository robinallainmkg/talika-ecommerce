import { NextResponse } from "next/server"
import { AgentOrchestrator } from "@/lib/agents/base-agent"
import { TrafficAgent } from "@/lib/agents/traffic-agent"
import { SalesAgent } from "@/lib/agents/sales-agent"
import { AdsAgent } from "@/lib/agents/ads-agent"
import { KlaviyoAgent } from "@/lib/agents/klaviyo-agent"
import { CoachAgent } from "@/lib/agents/coach-agent"

const orchestrator = new AgentOrchestrator()
orchestrator.register(new TrafficAgent(), "traffic")
orchestrator.register(new SalesAgent(), "sales")
orchestrator.register(new AdsAgent(), "ads")
orchestrator.register(new KlaviyoAgent(), "klaviyo")
orchestrator.register(new CoachAgent(), "coach")

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { agentType } = body

    if (agentType === "all") {
      const insights = await orchestrator.runAll()
      return NextResponse.json({ insights, runs: orchestrator.getRunHistory() })
    }

    const insights = await orchestrator.runAgent(agentType)
    return NextResponse.json({ insights })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent execution failed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    insights: orchestrator.getInsights(),
    runs: orchestrator.getRunHistory(),
  })
}
