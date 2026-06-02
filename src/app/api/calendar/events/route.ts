import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("scheduled_at", { ascending: true })

    if (error) throw error

    const events = (data || []).map((e: any) => ({
      ...e,
      end_at: e.end_at || e.metadata?.end_date || null,
    }))

    return NextResponse.json({ events })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
