import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List all influencers with their codes, sorted by total_sales DESC
export async function GET() {
  try {
    const { data: influencers, error } = await supabase
      .from("influencers")
      .select(`*, influencer_codes (*)`)
      .order("total_sales", { ascending: false, nullsFirst: false })

    if (error) {
      console.error("Error fetching influencers:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ influencers: influencers || [] })
  } catch (error) {
    console.error("Influencers GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch influencers" },
      { status: 500 }
    )
  }
}

// POST: Create a new influencer
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const insertData: Record<string, unknown> = {
      name: body.name,
      instagram_handle: body.instagram_handle || null,
      tiktok_handle: body.tiktok_handle || null,
      email: body.email || null,
      phone: body.phone || null,
      tier: body.tier || null,
      category: body.category || null,
      status: body.status || "active",
      commission_rate: body.commission_rate ?? 12,
      notes: body.notes || null,
      has_fixed_fee: body.has_fixed_fee || false,
      fixed_fee_amount: body.fixed_fee_amount || 0,
      total_sales: 0,
      total_orders: 0,
      total_commissions: 0,
      total_fixed_fees: 0,
    }

    const { data, error } = await supabase
      .from("influencers")
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error("Error creating influencer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ influencer: data })
  } catch (error) {
    console.error("Influencers POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create influencer" },
      { status: 500 }
    )
  }
}

// PATCH: Update an influencer
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    // Only allow updating specific fields
    const allowedFields = [
      "name", "instagram_handle", "tiktok_handle", "email", "phone",
      "tier", "category", "status", "commission_rate", "notes",
      "has_fixed_fee", "fixed_fee_amount", "metadata",
    ]

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    const { data, error } = await supabase
      .from("influencers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating influencer:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ influencer: data })
  } catch (error) {
    console.error("Influencers PATCH error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update influencer" },
      { status: 500 }
    )
  }
}
