import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

// GET /api/agents — list agents + latest runs + pending proposals count
export async function GET() {
  const supabase = createServiceClient()

  const [agentsRes, runsRes, proposalsRes] = await Promise.all([
    supabase.from("agents").select("*").order("id"),
    supabase
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("agent_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ])

  return NextResponse.json({
    agents: agentsRes.data || [],
    runs: runsRes.data || [],
    proposals: proposalsRes.data || [],
  })
}

// POST /api/agents — trigger an agent run (creates a pending run in Supabase)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { agentId, inputData } = body

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // If agentId is "all", trigger all active agents
  if (agentId === "all") {
    const { data: agents } = await supabase
      .from("agents")
      .select("id")
      .eq("is_active", true)

    const runs = []
    for (const agent of agents || []) {
      const { data } = await supabase
        .from("agent_runs")
        .insert({
          agent_id: agent.id,
          status: "pending",
          input_data: inputData || {},
        })
        .select()
        .single()
      if (data) runs.push(data)
    }

    return NextResponse.json({ runs })
  }

  // Single agent trigger
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      agent_id: agentId,
      status: "pending",
      input_data: inputData || {},
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ run: data })
}
