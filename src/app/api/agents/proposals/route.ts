import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

// GET /api/agents/proposals — list proposals, optionally filtered by page_context
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const pageContext = searchParams.get("page_context")
  const limit = parseInt(searchParams.get("limit") || "10", 10)
  const agentId = searchParams.get("agent_id")

  const supabase = createServiceClient()

  let query = supabase
    .from("agent_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (pageContext) {
    query = query.eq("page_context", pageContext)
  }
  if (agentId) {
    query = query.eq("agent_id", agentId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposals: data || [] })
}

// PATCH /api/agents/proposals — approve or reject a proposal
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { proposalId, status, reviewNotes } = body

  if (!proposalId || !["approved", "rejected"].includes(status)) {
    return NextResponse.json(
      { error: "proposalId and status (approved|rejected) required" },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("agent_proposals")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes || null,
    })
    .eq("id", proposalId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposal: data })
}
