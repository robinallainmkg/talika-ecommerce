import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"

const VALID_TYPES = [
  "promo",
  "campaign",
  "launch",
  "event",
  "newsletter",
  "influence",
  "content",
  "social",
  "youtube",
  "email",
  "ad_launch",
  "meeting",
]

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

// POST: créer un événement à la main (source = "manual" → jamais effacé par la sync Canva).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body?.title || !body?.event_type || !body?.scheduled_at) {
      return NextResponse.json(
        { error: "title, event_type et scheduled_at sont requis" },
        { status: 400 }
      )
    }
    if (!VALID_TYPES.includes(body.event_type)) {
      return NextResponse.json(
        { error: `event_type invalide: ${body.event_type}` },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const endDate: string | undefined = body.end_at || undefined

    const row = {
      title: String(body.title).trim(),
      event_type: body.event_type,
      scheduled_at: `${String(body.scheduled_at).slice(0, 10)}T00:00:00Z`,
      channel: body.channel || "web",
      description: body.description ? String(body.description) : null,
      status: body.status || "planned",
      metadata: {
        source: "manual",
        ...(endDate ? { end_date: endDate.slice(0, 10) } : {}),
      },
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .insert(row)
      .select("*")
      .single()

    if (error) throw error

    return NextResponse.json({
      event: { ...data, end_at: data.metadata?.end_date || null },
    })
  } catch (err: any) {
    console.error("Calendar event POST error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
