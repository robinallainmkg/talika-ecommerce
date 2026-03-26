import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET: list fees for an influencer
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get("influencer_id")

  let query = supabase
    .from("influencer_fixed_fees")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })

  if (influencerId) {
    query = query.eq("influencer_id", influencerId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fees: data || [] })
}

// POST: add a fixed fee
export async function POST(request: Request) {
  const body = await request.json()

  if (!body.influencer_id || !body.amount || !body.month || !body.year) {
    return NextResponse.json(
      { error: "influencer_id, amount, month, year required" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("influencer_fixed_fees")
    .upsert(
      {
        influencer_id: body.influencer_id,
        amount: body.amount,
        month: body.month,
        year: body.year,
        label: body.label || null,
      },
      { onConflict: "influencer_id,year,month" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update total_fixed_fees on the influencer
  const { data: allFees } = await supabase
    .from("influencer_fixed_fees")
    .select("amount")
    .eq("influencer_id", body.influencer_id)

  const total = (allFees || []).reduce((s: number, f: any) => s + Number(f.amount), 0)

  await supabase
    .from("influencers")
    .update({ total_fixed_fees: total, has_fixed_fee: total > 0 })
    .eq("id", body.influencer_id)

  return NextResponse.json({ success: true, fee: data })
}

// DELETE: remove a fixed fee
export async function DELETE(request: Request) {
  const body = await request.json()

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  // Get the fee first to know the influencer_id
  const { data: fee } = await supabase
    .from("influencer_fixed_fees")
    .select("influencer_id")
    .eq("id", body.id)
    .single()

  const { error } = await supabase
    .from("influencer_fixed_fees")
    .delete()
    .eq("id", body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalc total
  if (fee) {
    const { data: allFees } = await supabase
      .from("influencer_fixed_fees")
      .select("amount")
      .eq("influencer_id", fee.influencer_id)

    const total = (allFees || []).reduce((s: number, f: any) => s + Number(f.amount), 0)

    await supabase
      .from("influencers")
      .update({ total_fixed_fees: total, has_fixed_fee: total > 0 })
      .eq("id", fee.influencer_id)
  }

  return NextResponse.json({ success: true })
}
