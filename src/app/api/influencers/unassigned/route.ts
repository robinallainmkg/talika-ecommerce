import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // Fetch discount codes from Shopify data_cache
    const { data, error } = await supabase
      .from("data_cache")
      .select("data")
      .eq("key", "shopify_discount_codes_2026")
      .single()

    if (error || !data) {
      return NextResponse.json({ codes: [] })
    }

    const codes = Array.isArray(data.data) ? data.data : []
    return NextResponse.json({ codes })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
