import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/client"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
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
 * ⚠️ La table calendar_events n'a PAS de colonne end_at : le multi-jour vit
 * dans metadata.end_date (le GET /api/calendar/events le remappe → end_at).
 * On supprime puis réinsère uniquement les lignes du seed
 * (metadata.source = "canva_planning") ; les événements créés à la main
 * (source = "manual") et les micro-events détaillés ne sont JAMAIS touchés.
 */

interface CalendarInput {
  title: string
  event_type: "promo" | "campaign" | "launch" | "event" | "newsletter" | "influence" | "ad_launch" | "content"
  scheduled_at: string // YYYY-MM-DD
  end_at?: string // YYYY-MM-DD (stocké dans metadata.end_date)
  channel?: string
  description?: string
  products?: string[]
}

// Planning macro 2026 — reconcilié Canva (DAG7BX1zTgs) + emails NPD (24 juin 2026)
// MAJ 01/08/2026 : soldes été → 21/07, Collagen Fusion → 19/07, + Sélection été, Last Chance, Back to work 16-31/08 (-10 % routine visage)
const PLANNING_2026: CalendarInput[] = [
  // ── Offres ──────────────────────────────────────────────────────────────
  { title: "Soldes privées", event_type: "promo", scheduled_at: "2026-01-04", end_at: "2026-01-06" },
  { title: "SOLDES", event_type: "promo", scheduled_at: "2026-01-07", end_at: "2026-01-25" },
  { title: "Blue Days", event_type: "promo", scheduled_at: "2026-03-06", end_at: "2026-03-08" },
  { title: "Promo Bust", event_type: "promo", scheduled_at: "2026-04-21", end_at: "2026-04-22" },
  { title: "French Days", event_type: "promo", scheduled_at: "2026-04-29", end_at: "2026-05-04", description: "10/15/20% hors nouveautés" },
  { title: "Soldes été", event_type: "promo", scheduled_at: "2026-06-22", end_at: "2026-07-21", description: "2ᵉ démarque +10 % (PLUS10) à partir du 10/07" },
  { title: "Last Chance (jusqu'à -40 %)", event_type: "promo", scheduled_at: "2026-08-01", end_at: "2026-08-15", description: "Déstockage anti-gaspi — 20 produits, remises en prix direct, collection last-chance" },
  { title: "Back to work", event_type: "promo", scheduled_at: "2026-08-16", end_at: "2026-08-31", description: "-10 % routine visage — focus skincare & anti-âge" },
  { title: "French Days", event_type: "promo", scheduled_at: "2026-09-19", end_at: "2026-09-28", description: "Démarrage le samedi 19/09 (avant le lancement officiel du 22). Mécanique de remise à confirmer." },
  { title: "Black Weeks", event_type: "promo", scheduled_at: "2026-11-13", end_at: "2026-11-30" },
  { title: "Fêtes", event_type: "promo", scheduled_at: "2026-12-01", end_at: "2026-12-25" },

  // ── Lancements (NPD) ────────────────────────────────────────────────────
  { title: "Gel Crème Hydra", event_type: "launch", scheduled_at: "2026-01-26", end_at: "2026-01-31" },
  { title: "ETP Léopard (éd. limitée)", event_type: "launch", scheduled_at: "2026-02-10", end_at: "2026-02-14", description: "Patchs yeux édition limitée — à confirmer" },
  { title: "Mascara Extension XXL Bleu", event_type: "launch", scheduled_at: "2026-03-03", end_at: "2026-03-05", description: "+ nouveaux packs mascaras" },
  { title: "Eye Detox new", event_type: "launch", scheduled_at: "2026-03-29", end_at: "2026-03-30" },
  { title: "CICA Eye Patchs", event_type: "launch", scheduled_at: "2026-04-08", end_at: "2026-04-09" },
  { title: "Sérum In-Mist Anti-taches", event_type: "launch", scheduled_at: "2026-05-25", end_at: "2026-05-27", description: "Lancement ~mai (email NPD) — à confirmer" },
  { title: "Ultra Sérum In-Mist Vitamine C", event_type: "launch", scheduled_at: "2026-06-15", end_at: "2026-06-17", description: "Brume / Glow" },
  { title: "Collagen Fusion", event_type: "launch", scheduled_at: "2026-07-01", end_at: "2026-07-04", description: "Mask + eye patch" },
  { title: "Beard Power", event_type: "launch", scheduled_at: "2026-11-09" },
  { title: "INK · Eyebrow Fix it", event_type: "launch", scheduled_at: "2026-11-01", end_at: "2026-11-03", description: "Sourcils — dates à confirmer" },

  // ── Thématiques ─────────────────────────────────────────────────────────
  { title: "Contour yeux", event_type: "campaign", scheduled_at: "2026-02-04", end_at: "2026-02-15" },
  { title: "Lash days", event_type: "campaign", scheduled_at: "2026-02-17", end_at: "2026-03-02" },
  { title: "Lash days", event_type: "campaign", scheduled_at: "2026-03-10", end_at: "2026-03-15" },
  { title: "Hair Force", event_type: "campaign", scheduled_at: "2026-03-16", end_at: "2026-03-27" },
  { title: "Patch me if you can", event_type: "campaign", scheduled_at: "2026-04-01", end_at: "2026-04-09", description: "Cica Eye Patchs" },
  { title: "LED Therapy Mask", event_type: "campaign", scheduled_at: "2026-05-15", end_at: "2026-05-18" },
  { title: "LED Therapy Mask", event_type: "campaign", scheduled_at: "2026-06-01", end_at: "2026-06-04" },
  { title: "Glow — Sérum en brume Vit C", event_type: "campaign", scheduled_at: "2026-06-15", end_at: "2026-06-17" },
  { title: "Glow — Collagen Fusion & INK", event_type: "campaign", scheduled_at: "2026-07-01", end_at: "2026-07-19", description: "Collagen Fusion Mask & Patchs" },
  { title: "Sélection de l'été", event_type: "campaign", scheduled_at: "2026-07-21", end_at: "2026-08-15" },
  { title: "Focus été", event_type: "campaign", scheduled_at: "2026-07-22", end_at: "2026-08-02", description: "BEM après soleil, brumes, gels crèmes, mascara WR" },
  { title: "Hair Force — Casquette", event_type: "campaign", scheduled_at: "2026-09-07", end_at: "2026-09-10" },
  { title: "Anti-taches", event_type: "campaign", scheduled_at: "2026-09-21" },
  { title: "Focus devices", event_type: "campaign", scheduled_at: "2026-10-01", end_at: "2026-10-02", description: "TC7+, LED Mask, Hair Cap" },
  { title: "Focus anti-âge", event_type: "campaign", scheduled_at: "2026-10-16", end_at: "2026-10-18" },
  { title: "Focus cils & sourcils", event_type: "campaign", scheduled_at: "2026-11-01", end_at: "2026-11-03" },

  // ── Événements spéciaux ──────────────────────────────────────────────────
  { title: "Shoot produits", event_type: "event", scheduled_at: "2026-05-11" },
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

    // On ne supprime QUE les lignes issues du seed Canva (source = canva_planning).
    // Les events créés à la main (source = manual) et les micro-events détaillés
    // (newsletters, influence…) sont préservés.
    await supabase
      .from("calendar_events")
      .delete()
      .filter("metadata->>source", "eq", "canva_planning")

    // Insert new events. ⚠️ pas de colonne end_at → multi-jour dans metadata.end_date.
    const rows = events.map((e) => ({
      title: e.title,
      event_type: e.event_type,
      scheduled_at: `${e.scheduled_at}T00:00:00Z`,
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
