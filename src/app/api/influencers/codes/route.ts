import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizeCode } from "@/lib/codes"
import { marketFromRequest } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List all codes with their influencer names
export async function GET(request: Request) {
  try {
    // Les codes promo vivent sur Shopify FR : hors marché FR → liste vide
    // (sinon les codes FR apparaissent dans la vue UK).
    if (marketFromRequest(request) !== "FR") {
      return NextResponse.json({ codes: [] })
    }
    const { data: codes, error } = await supabase
      .from("influencer_codes")
      .select(`*, influencers ( id, name )`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching codes:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ codes: codes || [] })
  } catch (error) {
    console.error("Codes GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch codes" },
      { status: 500 }
    )
  }
}

// POST: Assign a code to an influencer
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.code) {
      return NextResponse.json(
        { error: "code is required" },
        { status: 400 }
      )
    }

    const code = body.code.toUpperCase().trim()
    const fields: Record<string, unknown> = {
      code,
      discount_percent: body.discount_percent ?? 15,
      is_active: true,
      code_type: body.code_type || "influencer",
      // null explicite : si on re-catégorise un code influenceur en code site,
      // l'ancien influencer_id doit être effacé.
      influencer_id: body.influencer_id ?? null,
    }

    // IDEMPOTENT : la table n'a PAS de contrainte d'unicité sur `code`. Sans ce
    // garde-fou, chaque enregistrement ré-INSÈRE une ligne → doublons (le code
    // ressortait comme "non attribué", l'admin re-sauvait, etc.). On cherche donc
    // toute ligne au code normalisé identique : si elle existe on la MET À JOUR
    // (et on purge les doublons hérités), sinon on insère.
    const { data: allRows } = await supabase.from("influencer_codes").select("id, code")
    const norm = normalizeCode(code)
    const dupes = (allRows || []).filter((r) => normalizeCode(r.code) === norm)

    if (dupes.length > 0) {
      const { data, error } = await supabase
        .from("influencer_codes")
        .update(fields)
        .eq("id", dupes[0].id)
        .select(`*, influencers ( id, name )`)
        .single()
      if (error) {
        console.error("Error updating code:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (dupes.length > 1) {
        await supabase.from("influencer_codes").delete().in("id", dupes.slice(1).map((r) => r.id))
      }
      return NextResponse.json({ code: data })
    }

    const { data, error } = await supabase
      .from("influencer_codes")
      .insert(fields)
      .select(`*, influencers ( id, name )`)
      .single()

    if (error) {
      console.error("Error creating code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error("Codes POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create code" },
      { status: 500 }
    )
  }
}

// DELETE: Deactivate a code (toggle is_active)
export async function DELETE(request: Request) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    // Toggle: if currently active, deactivate; if inactive, activate
    const { data: current, error: fetchError } = await supabase
      .from("influencer_codes")
      .select("is_active")
      .eq("id", body.id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const newStatus = !current.is_active

    const { data, error } = await supabase
      .from("influencer_codes")
      .update({ is_active: newStatus })
      .eq("id", body.id)
      .select(`*, influencers ( id, name )`)
      .single()

    if (error) {
      console.error("Error toggling code:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ code: data })
  } catch (error) {
    console.error("Codes DELETE error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to toggle code" },
      { status: 500 }
    )
  }
}
