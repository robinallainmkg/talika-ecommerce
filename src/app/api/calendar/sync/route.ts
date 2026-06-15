import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min (Vercel Pro) — évite le timeout du bouton sync

/**
 * POST /api/calendar/sync
 *
 * Synchronise le planning Canva → calendar_events.
 *
 * Deux modes :
 * 1. Sans body → réimporte le planning 2026 connu (hard-coded ci-dessous,
 *    mis à jour manuellement quand le Canva change).
 * 2. Avec body { events: [...] } → upsert les événements fournis
 *    (utilisé par Claude Code après lecture du Canva via MCP).
 *
 * Les événements macro (channel = "web") sont supprimés puis réinsérés.
 * Les événements détaillés (newsletter, influence) ne sont PAS touchés.
 */

interface CalendarInput {
  title: string
  event_type: "promo" | "campaign" | "launch" | "newsletter" | "influence" | "ad_launch" | "content"
  scheduled_at: string // YYYY-MM-DD
  end_at?: string // YYYY-MM-DD
  channel?: string
  description?: string
  products?: string[]
}

// Planning macro 2026 extrait du Canva DAG7BX1zTgs (dernière lecture : 2 juin 2026)
const PLANNING_2026: CalendarInput[] = [
  { title: "Soldes privées", event_type: "promo", scheduled_at: "2026-01-04", end_at: "2026-01-05" },
  { title: "SOLDES", event_type: "promo", scheduled_at: "2026-01-07", end_at: "2026-01-25" },
  { title: "GEL CRÈME HYDRA", event_type: "launch", scheduled_at: "2026-01-26", end_at: "2026-01-31" },
  { title: "Contour yeux", event_type: "campaign", scheduled_at: "2026-02-04", end_at: "2026-02-15" },
  { title: "Lash days", event_type: "campaign", scheduled_at: "2026-02-17", end_at: "2026-03-02" },
  { title: "MASCARAS bleu + new packs", event_type: "launch", scheduled_at: "2026-03-03", end_at: "2026-03-05" },
  { title: "BLUE DAYS", event_type: "promo", scheduled_at: "2026-03-06", end_at: "2026-03-08" },
  { title: "Lash days", event_type: "campaign", scheduled_at: "2026-03-10", end_at: "2026-03-15" },
  { title: "Hair Force", event_type: "campaign", scheduled_at: "2026-03-16", end_at: "2026-03-27" },
  { title: "Eye Detox new", event_type: "launch", scheduled_at: "2026-03-29", end_at: "2026-03-30" },
  { title: "Patch me if you can", event_type: "campaign", scheduled_at: "2026-04-01", end_at: "2026-04-09", description: "Cica Eye Patchs" },
  { title: "CICA EYE PATCHS", event_type: "launch", scheduled_at: "2026-04-08", end_at: "2026-04-09" },
  { title: "Promo Bust", event_type: "promo", scheduled_at: "2026-04-21", end_at: "2026-04-22" },
  { title: "French Days", event_type: "promo", scheduled_at: "2026-04-29", end_at: "2026-05-04", description: "10/15/20% hors nouveautés" },
  { title: "LED THERAPY MASK", event_type: "campaign", scheduled_at: "2026-05-15", end_at: "2026-05-18" },
  { title: "LED THERAPY MASK", event_type: "campaign", scheduled_at: "2026-06-01", end_at: "2026-06-04" },
  { title: "Glow — Sérum en brume Vit C", event_type: "campaign", scheduled_at: "2026-06-15", end_at: "2026-06-17" },
  { title: "SOLDES été", event_type: "promo", scheduled_at: "2026-06-22", end_at: "2026-06-30" },
  { title: "Glow — Collagen Fusion & INK", event_type: "campaign", scheduled_at: "2026-07-01", end_at: "2026-07-04" },
  { title: "FOCUS ÉTÉ", event_type: "campaign", scheduled_at: "2026-07-22", end_at: "2026-08-02", description: "BEM après soleil, brumes, gels crèmes, mascara WR" },
  { title: "Back to work", event_type: "campaign", scheduled_at: "2026-08-17", end_at: "2026-08-20", description: "Focus skincare & anti-âge" },
  { title: "Hair Force — Casquette", event_type: "campaign", scheduled_at: "2026-09-07", end_at: "2026-09-10" },
  { title: "ANTI-TACHES", event_type: "campaign", scheduled_at: "2026-09-21", end_at: "2026-09-21" },
  { title: "French Days", event_type: "promo", scheduled_at: "2026-09-22", end_at: "2026-09-30" },
  { title: "FOCUS devices", event_type: "campaign", scheduled_at: "2026-10-01", end_at: "2026-10-02", description: "TC7+, LED Mask, Hair Cap" },
  { title: "FOCUS ANTI-ÂGE", event_type: "campaign", scheduled_at: "2026-10-16", end_at: "2026-10-18" },
  { title: "Focus cils & sourcils", event_type: "campaign", scheduled_at: "2026-11-01", end_at: "2026-11-03" },
  { title: "Beard Power", event_type: "launch", scheduled_at: "2026-11-09", end_at: "2026-11-09" },
  { title: "Black Weeks", event_type: "promo", scheduled_at: "2026-11-13", end_at: "2026-11-30" },
  { title: "FÊTES", event_type: "promo", scheduled_at: "2026-12-01", end_at: "2026-12-04" },
]

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient()

    let events: CalendarInput[]
    const contentType = req.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null)
      events = body?.events?.length > 0 ? body.events : PLANNING_2026
    } else {
      events = PLANNING_2026
    }

    // Delete existing macro events (channel = web, source = canva_planning)
    await supabase
      .from("calendar_events")
      .delete()
      .eq("channel", "web")

    // Insert new events
    const rows = events.map((e) => ({
      title: e.title,
      event_type: e.event_type,
      scheduled_at: `${e.scheduled_at}T00:00:00Z`,
      end_at: e.end_at ? `${e.end_at}T23:59:59Z` : null,
      channel: e.channel || "web",
      description: e.description || null,
      status: "planned",
      metadata: {
        source: "canva_planning",
        ...(e.products ? { products: e.products } : {}),
        ...(e.end_at ? { end_date: e.end_at } : {}),
      },
    }))

    const { data, error } = await supabase
      .from("calendar_events")
      .insert(rows)
      .select("id")

    if (error) throw error

    return NextResponse.json({
      success: true,
      synced_at: new Date().toISOString(),
      events_count: data?.length || 0,
      source: events === PLANNING_2026 ? "built-in planning 2026" : "custom payload",
    })
  } catch (err: any) {
    console.error("Calendar sync error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
