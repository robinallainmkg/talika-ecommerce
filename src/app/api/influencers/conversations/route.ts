import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { outreachConfigured } from "@/lib/influence/outreach"
import { canReplyFromApp, normalizeMarket } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// GET ?influencer_id= → fil de conversation complet (influence_messages, tri chrono)
// + état outreach + can_reply (marchés branchés en envoi : cf. canReplyFromApp — la
// boîte FR Outlook n'est pas encore connectée, cf. Phase 2 Graph).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("influencer_id")
    if (!id) return NextResponse.json({ error: "influencer_id requis" }, { status: 400 })

    const [{ data: inf, error: infErr }, { data: messages, error: msgErr }] = await Promise.all([
      supabase.from("influencers")
        .select("id, name, email, market, instagram_handle, metadata")
        .eq("id", id).maybeSingle(),
      supabase.from("influence_messages")
        .select("id, direction, source, mailbox, from_email, to_email, subject, body_text, sent_at, message_id")
        .eq("influencer_id", id)
        .order("sent_at", { ascending: true })
        .limit(200),
    ])
    if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })
    if (!inf) return NextResponse.json({ error: "influenceuse introuvable" }, { status: 404 })
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

    const market = normalizeMarket(inf.market)
    const can_reply = canReplyFromApp(market) && outreachConfigured() && !!inf.email
    const reply_blocked_reason = !inf.email
      ? "email manquant"
      : !canReplyFromApp(market)
        ? `Boîte ${market} (Outlook) non connectée — lecture seule pour l'instant`
        : !outreachConfigured()
          ? "canal mail non configuré (RESEND_API_KEY / SMTP)"
          : null

    return NextResponse.json({
      influencer: {
        id: inf.id, name: inf.name, email: inf.email,
        market, instagram_handle: inf.instagram_handle,
      },
      outreach: (inf.metadata as Record<string, unknown> | null)?.outreach || null,
      messages: messages || [],
      can_reply,
      reply_blocked_reason,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
