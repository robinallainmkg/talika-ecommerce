import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("projects")
      .select(`*, project_tasks (*)`)
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json({ projects: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
