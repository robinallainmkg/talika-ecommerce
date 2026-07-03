import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

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
