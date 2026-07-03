/**
 * GET/POST /api/objectives
 *
 * CRUD for the objectives_2026 table — the single source of truth for the
 * Objectives 2026 page. No caching layer, no overrides.
 *
 * == TABLE: objectives_2026 (Supabase, project uvohlnmwiucedehemxrt) ==
 *
 *   month       int PK     — 1-12
 *   ca_2025     numeric    — CA HT 2025 (compta : Choose + Shopify + Amazon). SAISIE MANUELLE.
 *   ca_2026     numeric    — CA HT 2026 (compta : Choose + Shopify + Amazon). SAISIE MANUELLE.
 *   media_spent numeric    — Media spend HT (ads only, compta). SAISIE MANUELLE.
 *   generosite  numeric    — Taux de remise % (Shopify uniquement). AUTO (voir sync/route.ts).
 *   updated_at  timestamptz
 *
 * == DATA FLOW (réalité — vérifié 15 juin 2026) ==
 *
 *   ca_2025 / ca_2026 / media_spent = TOUJOURS MANUELS : ces chiffres viennent de la
 *   compta (HT, agrégat Choose + Shopify + Amazon) et ne sont pas scrapables. On les
 *   saisit sur la page (cellules + "Sauvegarder") ou par SQL. Rien ne les calcule.
 *
 *   1. "Sync Shopify" button → POST /api/objectives/sync → recalcule UNIQUEMENT generosite
 *      (méthode canonique computeGenerosite). PRÉSERVE ca_2025, ca_2026, media_spent.
 *      Lancé aussi par le cron quotidien (runFullSync, étape "objectives").
 *   2. Page "Sauvegarder" button → POST /api/objectives → enregistre les champs éditables.
 *   3. GET /api/objectives → lit objectives_2026, renvoie tel quel (shopify_data: {} = aucun
 *      overlay ; l'ancien overlay ca_2026←Shopify côté page est donc mort, c'est voulu).
 *
 * == INFLUENCE SPENDING (TODO) ==
 *
 *   Not yet tracked in this table. Sources:
 *   - Jan-Mar 2026: "Paiements Influenceurs.xlsx" (SharePoint Compta_fournisseurs)
 *   - Apr+ 2026: "budget influs 2026-27.xlsx" (SharePoint webmaster) for fixed costs
 *     + commissions calculated from Shopify discount code sales (12% rate)
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ObjectiveRow {
  month: number
  ca_2025: number
  ca_2026: number
  media_spent: number
  generosite: number
}

export async function GET() {
  try {
    // Fetch objectives data
    const { data: objectives, error } = await supabase
      .from("objectives_2026")
      .select("*")
      .order("month")

    if (error) {
      console.error("Error fetching objectives:", error)
      return NextResponse.json({ objectives: [], shopify_data: {} })
    }

    return NextResponse.json({
      objectives: objectives || [],
      shopify_data: {},
    })
  } catch (error) {
    console.error("Objectives GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch objectives" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rows: ObjectiveRow[] = body.rows

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 })
    }

    // Upsert all 12 months
    const upsertData = rows.map((row) => ({
      month: row.month,
      ca_2025: row.ca_2025 || 0,
      ca_2026: row.ca_2026 || 0,
      media_spent: row.media_spent || 0,
      generosite: row.generosite || 0,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from("objectives_2026")
      .upsert(upsertData, { onConflict: "month" })

    if (error) {
      console.error("Upsert error:", error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      saved_at: new Date().toISOString(),
      count: upsertData.length,
    })
  } catch (error) {
    console.error("Objectives POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save objectives" },
      { status: 500 }
    )
  }
}
