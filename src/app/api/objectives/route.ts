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
