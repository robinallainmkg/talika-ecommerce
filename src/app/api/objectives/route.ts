/**
 * GET/POST /api/objectives
 *
 * CRUD for the objectives_2026 table — the single source of truth for the
 * Objectives 2026 page. No caching layer, no overrides.
 *
 * == TABLE: objectives_2026 (Supabase, project uvohlnmwiucedehemxrt) ==
 *
 *   month       int PK     — 1-12
 *   ca_2025     numeric    — CA comparison (ideally from Reporting Global, not Shopify-only)
 *   ca_2026     numeric    — CA actuel (ideally from Reporting Global)
 *   media_spent numeric    — Media spend (ads only, from Reporting Global)
 *   generosite  numeric    — Discount rate % (Shopify-only, see sync/route.ts for formula)
 *   updated_at  timestamptz
 *
 * == DATA FLOW ==
 *
 *   1. "Sync Shopify" button → POST /api/objectives/sync → overwrites ca_2025, ca_2026,
 *      generosite with Shopify-only data. Preserves media_spent.
 *   2. Manual SQL inserts → for reporting values (Shopify + Amazon + Choose).
 *      Run AFTER sync to override Shopify-only CA values.
 *   3. Page "Sauvegarder" button → POST /api/objectives → saves all editable fields.
 *   4. GET /api/objectives → reads objectives_2026, returns as-is. No cache overlay.
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
