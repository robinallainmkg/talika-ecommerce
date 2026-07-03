import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET: contenu d'une influenceuse (?influencer_id=) OU liste globale pour la
// page Contenus (?brand=1 pour ne garder que les posts Talika, &market=, &limit=).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get("influencer_id")

  if (influencerId) {
    const { data, error } = await supabase
      .from("influencer_content")
      .select("*")
      .eq("influencer_id", influencerId)
      .order("posted_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ content: data || [] })
  }

  // Liste globale (page Contenus) — jointure nom/handle/marché
  const brandOnly = searchParams.get("brand") === "1"
  const market = (searchParams.get("market") || "").toUpperCase()
  const limit = Math.min(parseInt(searchParams.get("limit") || "120"), 300)
  let query = supabase
    .from("influencer_content")
    .select("id, influencer_id, platform, type, media_product_type, url, caption, thumbnail_url, like_count, comments_count, is_brand, posted_at, influencers!inner(id, name, instagram_handle, market, metadata)")
    .eq("platform", "instagram")
    .order("posted_at", { ascending: false })
    .limit(limit)
  if (brandOnly) query = query.eq("is_brand", true)
  if (market === "FR" || market === "UK") query = query.eq("influencers.market", market)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data || [] })
}

// POST: create a content item
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.influencer_id) {
      return NextResponse.json(
        { error: "influencer_id required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("influencer_content")
      .insert({
        influencer_id: body.influencer_id,
        type: body.type || "post",
        platform: body.platform || "instagram",
        url: body.url || null,
        title: body.title || null,
        notes: body.notes || null,
        posted_at: body.posted_at || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ content: data })
  } catch (error) {
    console.error("Content POST error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create content",
      },
      { status: 500 }
    )
  }
}

// DELETE: delete a content item by id
export async function DELETE(request: Request) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 })
    }

    const { error } = await supabase
      .from("influencer_content")
      .delete()
      .eq("id", body.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Content DELETE error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete content",
      },
      { status: 500 }
    )
  }
}
