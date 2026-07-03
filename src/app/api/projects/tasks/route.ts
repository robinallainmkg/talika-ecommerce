import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await req.json()
    const { project_id, title, parent_task_id } = body

    const { data, error } = await supabase
      .from("project_tasks")
      .insert({
        project_id,
        title,
        parent_task_id: parent_task_id || null,
        status: "todo",
        priority: "medium",
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ task: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    const { error } = await supabase
      .from("project_tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServiceClient()
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    await supabase.from("project_tasks").delete().eq("parent_task_id", id)
    const { error } = await supabase.from("project_tasks").delete().eq("id", id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
