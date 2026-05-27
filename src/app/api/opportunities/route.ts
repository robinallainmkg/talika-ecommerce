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

// PATCH — update status (done / ignored / pending)
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, status } = body

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("opportunities")
    .update({ status })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
