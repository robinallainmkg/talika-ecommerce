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
    .select("id, influencer_id, platform, type, media_product_type, url, caption, thumbnail_url, like_count, comments_count, is_brand, posted_at, external_id, partnership_ad_code, influencers!inner(id, name, instagram_handle, market, metadata)")
    .eq("platform", "instagram")
    .order("posted_at", { ascending: false })
    .limit(limit)
  if (brandOnly) query = query.eq("is_brand", true)
  if (market === "FR" || market === "UK") query = query.eq("influencers.market", market)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data || [] })
}

// PATCH { id, partnership_ad_code } — code de publicité de partenariat Meta
// (fourni par l'influenceuse) pour pouvoir booster ce post depuis Ads Manager.
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
  if (!("partnership_ad_code" in body)) return NextResponse.json({ error: "partnership_ad_code requis" }, { status: 400 })
  const code = typeof body.partnership_ad_code === "string" && body.partnership_ad_code.trim() !== ""
    ? body.partnership_ad_code.trim().slice(0, 60)
    : null
  const { error } = await supabase.from("influencer_content").update({ partnership_ad_code: code }).eq("id", body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, partnership_ad_code: code })
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
