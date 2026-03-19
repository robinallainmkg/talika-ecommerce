import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

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
