import { NextResponse } from "next/server"
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

// PATCH: modifier un événement. Préserve metadata.source ; met à jour metadata.end_date.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: "Body manquant" }, { status: 400 })
    }
    if (body.event_type && !VALID_TYPES.includes(body.event_type)) {
      return NextResponse.json(
        { error: `event_type invalide: ${body.event_type}` },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // On récupère l'event existant pour fusionner proprement metadata.
    const { data: existing, error: getErr } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .single()
    if (getErr || !existing) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
    }

    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = String(body.title).trim()
    if (body.event_type !== undefined) update.event_type = body.event_type
    if (body.channel !== undefined) update.channel = body.channel || "web"
    if (body.description !== undefined)
      update.description = body.description ? String(body.description) : null
    if (body.status !== undefined) update.status = body.status
    if (body.scheduled_at !== undefined)
      update.scheduled_at = `${String(body.scheduled_at).slice(0, 10)}T00:00:00Z`

    // metadata : conserver l'existant, ajuster end_date.
    const meta = { ...(existing.metadata || {}) } as Record<string, unknown>
    if (body.end_at !== undefined) {
      if (body.end_at) meta.end_date = String(body.end_at).slice(0, 10)
      else delete meta.end_date
    }
    update.metadata = meta

    const { data, error } = await supabase
      .from("calendar_events")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error

    return NextResponse.json({
      event: { ...data, end_at: data.metadata?.end_date || null },
    })
  } catch (err: any) {
    console.error("Calendar event PATCH error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: supprimer un événement.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Calendar event DELETE error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
