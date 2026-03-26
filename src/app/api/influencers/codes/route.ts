import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List all codes with their influencer names
export async function GET() {
  try {
    const { data: codes, error } = await supabase
      .from("influencer_codes")
      .select(`*, influencers ( id, name )`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching codes:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ codes: codes || [] })
  } catch (error) {
    console.error("Codes GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch codes" },
      { status: 500 }
    )
  }
}

// POST: Assign a code to an influencer
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.code) {
      return NextResponse.json(
        { error: "code is required" },
        { status: 400 }
      )
    }

    const insertData: Record<string, unknown> = {
      code: body.code.toUpperCase().trim(),
      discount_percent: body.discount_percent ?? 15,
      is_active: true,
      code_type: body.code_type || "influencer",
    }

    // influencer_id is optional (site/internal codes don't have one)
    if (body.influencer_id) {
      insertData.influencer_id = body.influencer_id
    }

    const { data, error } = await supabase
      .from("influencer_codes")
      .insert(insertData)
      .select(`*, influencers ( id, name )`)
      .single()

    if (error) {
      console.error("Error creating code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error("Codes POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create code" },
      { status: 500 }
    )
  }
}

// DELETE: Deactivate a code (toggle is_active)
export async function DELETE(request: Request) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    // Toggle: if currently active, deactivate; if inactive, activate
    const { data: current, error: fetchError } = await supabase
      .from("influencer_codes")
      .select("is_active")
      .eq("id", body.id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const newStatus = !current.is_active

    const { data, error } = await supabase
      .from("influencer_codes")
      .update({ is_active: newStatus })
      .eq("id", body.id)
      .select(`*, influencers ( id, name )`)
      .single()

    if (error) {
      console.error("Error toggling code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error("Codes DELETE error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to toggle code" },
      { status: 500 }
    )
  }
}
