import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET — list opportunities (pending by default, or all)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || "pending"

  let query = supabase
    .from("opportunities")
    .select("*")
    .order("impact", { ascending: true }) // high first (alphabetical: h < l < m)
    .order("created_at", { ascending: false })

  if (status !== "all") {
    query = query.eq("status", status)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data || [])
}

// POST — create a new opportunity
export async function POST(request: Request) {
  const body = await request.json()
  const { title, description, category, impact, prompt } = body

  if (!title || !description || !category) {
    return NextResponse.json({ error: "title, description, category required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      title,
      description,
      category: category || "other",
      impact: impact || "medium",
      prompt: prompt || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// PATCH — update status (done/ignored/pending) and/or rating (1-10)
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, status, rating } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }
  if (!status && rating === undefined) {
    return NextResponse.json({ error: "status or rating required" }, { status: 400 })
  }
  if (rating !== undefined && (rating < 1 || rating > 10 || !Number.isInteger(rating))) {
    return NextResponse.json({ error: "rating must be integer 1-10" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (status) update.status = status
  if (rating !== undefined) {
    update.rating = rating
    update.rated_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("opportunities")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update companion_weights when a rating is saved — learning loop
  if (rating !== undefined && data?.category) {
    try {
      const { data: weightsCache } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", "companion_weights")
        .single()

      const weights = (weightsCache?.data as Record<string, unknown>) || {}
      const scores = (weights.category_scores as Record<string, { sum: number; count: number }>) || {}
      const existing = scores[data.category] || { sum: 0, count: 0 }
      scores[data.category] = { sum: existing.sum + rating, count: existing.count + 1 }
      weights.category_scores = scores
      weights.last_updated = new Date().toISOString()

      await supabase.from("data_cache").upsert(
        { key: "companion_weights", data: weights, source: "companion", expires_at: null },
        { onConflict: "key" }
      )
    } catch {
      // Non-blocking — weight update failure doesn't fail the rating save
    }
  }

  return NextResponse.json(data)
}
