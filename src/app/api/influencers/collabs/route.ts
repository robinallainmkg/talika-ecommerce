import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { isStage } from "@/lib/influence/pipeline"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const STR = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const NUM = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))

interface InfRow {
  id: string; name: string; instagram_handle: string | null
  category: string | null; billing_name: string | null; commission_rate: number | null
  email: string | null
  metadata: Record<string, unknown> | null
}

// GET ?campaign= → collabs de la campagne, enrichies de l'influenceuse ET du coût
// du mois (forfait + commission), lu EN DIRECT depuis les tables coûts réconciliées.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const campaign = searchParams.get("campaign")
    if (!campaign) return NextResponse.json({ collabs: [] })

    // Période de la campagne (pour rapprocher les coûts du bon mois).
    const { data: camp } = await supabase
      .from("influence_campaigns").select("year, month").eq("id", campaign).maybeSingle()

    const { data: collabs } = await supabase
      .from("influence_campaign_collabs")
      .select("*")
      .eq("campaign_id", campaign)
      .order("position", { ascending: true })

    const ids = [...new Set((collabs || []).map((c) => c.influencer_id))]
    const { data: infs } = ids.length
      ? await supabase.from("influencers").select("id, name, instagram_handle, category, billing_name, commission_rate, email, metadata").in("id", ids)
      : { data: [] as InfRow[] }
    const byId: Record<string, InfRow> = {}
    for (const i of (infs || []) as InfRow[]) byId[i.id] = i

    // Stats conversation par influenceuse (une seule requête agrégée, pas de N+1).
    // Best-effort : si la RPC échoue (table/fonction absente), le kanban vit sans badge.
    const msgStats: Record<string, { message_count: number; last_message_at: string | null; last_inbound_at: string | null }> = {}
    if (ids.length) {
      const { data: stats } = await supabase.rpc("influence_message_stats", { inf_ids: ids })
      for (const s of (stats || []) as { influencer_id: string; message_count: number; last_message_at: string | null; last_inbound_at: string | null }[]) {
        msgStats[s.influencer_id] = s
      }
    }

    // Coûts du mois (forfait + commission) par influenceuse.
    const fee: Record<string, number> = {}
    const comm: Record<string, number> = {}
    if (camp?.year && camp?.month && ids.length) {
      const [fees, comms] = await Promise.all([
        supabase.from("influencer_fixed_fees").select("influencer_id, amount").eq("year", camp.year).eq("month", camp.month).in("influencer_id", ids),
        supabase.from("influencer_commissions").select("influencer_id, amount").eq("year", camp.year).eq("month", camp.month).in("influencer_id", ids),
      ])
      for (const r of fees.data || []) fee[r.influencer_id] = (fee[r.influencer_id] || 0) + Number(r.amount || 0)
      for (const r of comms.data || []) comm[r.influencer_id] = (comm[r.influencer_id] || 0) + Number(r.amount || 0)
    }

    const rows = (collabs || []).map((c) => {
      const inf = byId[c.influencer_id]
      const meta = (inf?.metadata || {}) as Record<string, unknown>
      const ms = msgStats[c.influencer_id]
      // Qualification "on a tout pour arbitrer" : stats de vues réelles
      // (story_views / insights_*), démographie (audience), prix (rate card
      // reçue OU conditions décidées deal_terms). Affichée en badges sur la carte.
      const aud = meta.audience as { platforms?: Record<string, unknown> } | undefined
      const sv = meta.story_views as { median?: number } | undefined
      const qual = {
        stats: sv?.median != null || meta.insights_30d != null || meta.insights_90d != null,
        demo: !!aud?.platforms && Object.keys(aud.platforms).length > 0,
        prix: meta.rates != null || meta.rate_card != null || meta.deal_terms != null,
      }
      return {
        qual,
        message_count: ms?.message_count || 0,
        last_message_at: ms?.last_message_at || null,
        // Dernier message = entrant → une réponse attend d'être traitée.
        awaiting_reply: !!(ms?.last_inbound_at && ms.last_inbound_at === ms.last_message_at),
        id: c.id,
        influencer_id: c.influencer_id,
        name: inf?.name || "?",
        email: inf?.email || null,
        instagram_handle: inf?.instagram_handle || null,
        niche: inf?.category || null,
        followers: meta.followers ?? meta.followers_count ?? null,
        stage: c.stage,
        owner: c.owner,
        next_action: c.next_action,
        next_action_date: c.next_action_date,
        themes: Array.isArray(c.themes) ? c.themes : [],
        fee: fee[c.influencer_id] || 0,
        commission: comm[c.influencer_id] || 0,
        commission_rate: inf?.commission_rate ?? null,
        comp_type: c.comp_type,
        comp_amount: c.comp_amount,
        deliverables: c.deliverables,
        position: c.position,
        notes: c.notes,
      }
    })
    return NextResponse.json({ collabs: rows })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// POST — ajouter une influenceuse à une campagne. Soit influencer_id (existante),
// soit { new_name, new_handle } (crée le prospect puis l'ajoute). Idempotent.
export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (!b.campaign_id) return NextResponse.json({ error: "campaign_id requis" }, { status: 400 })

    let influencerId = STR(b.influencer_id)
    if (!influencerId) {
      const name = STR(b.new_name)
      if (!name) return NextResponse.json({ error: "influencer_id ou new_name requis" }, { status: 400 })
      const handle = STR(b.new_handle)?.replace(/^@/, "") || null
      // Marché hérité de la campagne : un prospect créé depuis une campagne UK doit être UK
      // (sinon défaut FR → invisible dans les vues UK et jamais dans le drip outreach).
      const { data: camp } = await supabase
        .from("influence_campaigns").select("market").eq("id", b.campaign_id).single()
      const { data: created, error: cErr } = await supabase
        .from("influencers")
        .insert({
          name,
          instagram_handle: handle,
          email: STR(b.new_email),
          market: camp?.market || "FR",
          category: STR(b.new_niche),
          source: STR(b.source) || "pipeline",
          status: "prospect",
          metadata: b.new_followers ? { followers: NUM(b.new_followers) } : {},
        })
        .select("id")
        .single()
      if (cErr || !created) return NextResponse.json({ error: cErr?.message || "création prospect impossible" }, { status: 500 })
      influencerId = created.id
    }

    // Idempotent : si déjà dans la campagne, on renvoie l'existant.
    const { data: existing } = await supabase
      .from("influence_campaign_collabs")
      .select("id")
      .eq("campaign_id", b.campaign_id)
      .eq("influencer_id", influencerId)
      .maybeSingle()
    if (existing) return NextResponse.json({ collab_id: existing.id, influencer_id: influencerId, existed: true })

    const { data, error } = await supabase
      .from("influence_campaign_collabs")
      .insert({
        campaign_id: b.campaign_id,
        influencer_id: influencerId,
        stage: isStage(b.stage) ? b.stage : "prospect",
        owner: STR(b.owner),
      })
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ collab_id: data.id, influencer_id: influencerId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// PATCH — déplacer d'étape / éditer une collab. { id, stage?, owner?, next_action?, ... }
export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 })
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ("stage" in b && isStage(b.stage)) fields.stage = b.stage
    if ("themes" in b) fields.themes = Array.isArray(b.themes) ? b.themes.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim()) : []
    if ("owner" in b) fields.owner = STR(b.owner)
    if ("next_action" in b) fields.next_action = STR(b.next_action)
    if ("next_action_date" in b) fields.next_action_date = STR(b.next_action_date)
    if ("comp_type" in b) fields.comp_type = STR(b.comp_type)
    if ("comp_amount" in b) fields.comp_amount = NUM(b.comp_amount)
    if ("deliverables" in b) fields.deliverables = STR(b.deliverables)
    if ("notes" in b) fields.notes = STR(b.notes)
    if ("position" in b) fields.position = NUM(b.position) ?? 0
    const { error } = await supabase.from("influence_campaign_collabs").update(fields).eq("id", b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}

// DELETE ?id= → retirer une collab de la campagne (ne supprime pas l'influenceuse).
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 })
    const { error } = await supabase.from("influence_campaign_collabs").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
