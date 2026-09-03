import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"
import { outreachConfigured } from "@/lib/influence/outreach"
import { logOutbound } from "@/lib/influence/messages"
import { canReplyFromApp, normalizeMarket } from "@/lib/market"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const OUTREACH_FROM_DEFAULT = "Talika <talika@companion-ecommerce.com>"
const OUTREACH_REPLY_DEFAULT = "talika@companion-ecommerce.com"

// POST { influencer_id, body, subject? } — répond à une influenceuse depuis l'app.
// Marchés branchés en envoi (cf. canReplyFromApp) : boîte talika@companion-ecommerce.com
// via Resend, partagée UK/US.
// Threading : In-Reply-To/References posés depuis le dernier message ENTRANT du fil,
// pour que la réponse s'affiche dans la même conversation chez la destinataire.
// ⚠️ N'écrit PAS dans outreach_log : ce journal est l'anti-doublon du drip (fail-closed),
// une réponse manuelle n'a rien à y faire (le drip est déjà stoppé en statut terminal).
export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = typeof b.influencer_id === "string" ? b.influencer_id : null
    const body = typeof b.body === "string" ? b.body.trim() : ""
    if (!id || !body) return NextResponse.json({ error: "influencer_id et body requis" }, { status: 400 })

    const { data: inf, error: infErr } = await supabase
      .from("influencers").select("id, name, email, market").eq("id", id).maybeSingle()
    if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })
    if (!inf) return NextResponse.json({ error: "influenceuse introuvable" }, { status: 404 })

    const email = (inf.email || "").trim()
    if (!email.includes("@")) return NextResponse.json({ error: "email manquant sur la fiche" }, { status: 400 })
    const market = normalizeMarket(inf.market)
    if (!canReplyFromApp(market)) {
      return NextResponse.json(
        { error: `Réponse indisponible — boîte Outlook ${market} non connectée (Phase 2).` },
        { status: 400 }
      )
    }
    if (!outreachConfigured()) {
      return NextResponse.json({ error: "Canal mail non configuré (RESEND_API_KEY / SMTP)." }, { status: 400 })
    }

    // Threading : dernier message ENTRANT du fil → In-Reply-To + sujet par défaut.
    const { data: lastIn } = await supabase
      .from("influence_messages")
      .select("message_id, subject")
      .eq("influencer_id", id).eq("direction", "in")
      .not("message_id", "ilike", "synth:%")
      .order("sent_at", { ascending: false })
      .limit(1).maybeSingle()

    const lastSubject = (lastIn?.subject || "").trim()
    const subject = (typeof b.subject === "string" && b.subject.trim())
      ? b.subject.trim()
      : lastSubject
        ? (/^re\s*:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`)
        : `Re: Talika x ${inf.name}`
    const headers: Record<string, string> = {}
    if (lastIn?.message_id) {
      headers["In-Reply-To"] = lastIn.message_id
      headers["References"] = lastIn.message_id
    }

    const r = await sendMail({
      to: email, subject, text: body,
      from: process.env.OUTREACH_FROM || OUTREACH_FROM_DEFAULT,
      replyTo: process.env.OUTREACH_REPLY_TO || OUTREACH_REPLY_DEFAULT,
      ...(Object.keys(headers).length ? { headers } : {}),
    })
    if (!r.ok) return NextResponse.json({ error: r.error || "envoi échoué" }, { status: 502 })

    // Archivage du sortant (best-effort) — l'email est PARTI, on ne peut pas le dé-envoyer :
    // en cas d'échec d'écriture on renvoie ok + warning plutôt qu'une fausse erreur.
    const logged = await logOutbound(supabase, {
      influencer_id: inf.id, market, source: "reply_ui",
      to_email: email, subject, body_text: body, provider_id: r.id || null,
      in_reply_to: lastIn?.message_id || null,
      references_ids: lastIn?.message_id ? [lastIn.message_id] : null,
    })
    return NextResponse.json({
      ok: true, provider_id: r.id || null,
      ...(logged.ok ? {} : { warning: `envoyé mais non journalisé (${logged.error})` }),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
