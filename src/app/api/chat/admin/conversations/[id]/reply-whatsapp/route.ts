// Envoi d'une réponse WhatsApp — SEULE porte de sortie vers la cliente.
// Route distincte de .../reply pour ne pas toucher au chemin du chat site en production.
//
// Garde-fous (demandés explicitement par Robin) :
//   1. Aucun appel automatique. Cette route n'est déclenchée que par un clic humain.
//   2. Le corps envoyé est celui relu à l'écran ; aucune génération n'est postée telle quelle.
//   3. Refus hors fenêtre de service Meta de 24 h (Meta rejetterait le message libre :
//      il faudrait alors un template approuvé, ce qui n'est pas du SAV improvisé).
//   4. `confirmed: true` obligatoire dans le corps — un appel par erreur ne part pas.

import { NextResponse } from "next/server"
import { chatDb } from "@/lib/chat/db"
import { requireAdmin } from "@/lib/chat/admin-auth"
import { agentEmail } from "@/lib/chat/agent-identity"
import { sendConversationMessage } from "@/lib/chat/whatsapp/klaviyo-conversations"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const content = typeof body.content === "string" ? body.content.trim() : ""
  if (!content) return NextResponse.json({ error: "message vide" }, { status: 400 })
  if (content.length > 4000) {
    // Plafond WhatsApp ~4096 caractères : refuser AVANT l'appel API plutôt que
    // de laisser Meta tronquer ou rejeter silencieusement.
    return NextResponse.json({ error: `message trop long (${content.length}/4000 caractères)` }, { status: 400 })
  }
  if (body.confirmed !== true) {
    return NextResponse.json({ error: "envoi non confirmé" }, { status: 400 })
  }

  const db = chatDb()
  const { data: conversation } = await db
    .from("chat_conversations")
    .select("id, channel, klaviyo_conversation_id, service_window_expires_at, message_count")
    .eq("id", params.id)
    .single()
  if (!conversation) return NextResponse.json({ error: "conversation introuvable" }, { status: 404 })
  if (conversation.channel !== "whatsapp" || !conversation.klaviyo_conversation_id) {
    return NextResponse.json({ error: "conversation non WhatsApp" }, { status: 400 })
  }

  const expiry = conversation.service_window_expires_at
    ? new Date(conversation.service_window_expires_at).getTime()
    : 0
  if (expiry < Date.now()) {
    return NextResponse.json(
      {
        error: "fenêtre de service de 24 h fermée",
        detail:
          "Meta refuse un message libre passé 24 h après le dernier message de la cliente. " +
          "Il faut relancer via un template approuvé, ou répondre par email.",
      },
      { status: 409 }
    )
  }

  const sent = await sendConversationMessage(conversation.klaviyo_conversation_id, content)
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 })

  // À partir d'ici le message EST PARTI chez la cliente : un échec de journalisation
  // ne doit ni être avalé, ni se déguiser en échec d'envoi (l'agent renverrait un doublon).
  const now = new Date().toISOString()
  const email = await agentEmail()
  const journalErrors: string[] = []
  const { error: msgError } = await db.from("chat_messages").insert({
    conversation_id: params.id,
    role: "agent",
    content,
    agent_email: email,
    // Même identifiant que celui que le poll dérivera de l'API : la dédup par
    // external_id empêche notre propre réponse de revenir en doublon au tour suivant.
    ...(sent.id ? { external_id: `wa_${sent.id}` } : {}),
  })
  if (msgError) journalErrors.push(`chat_messages: ${msgError.message}`)
  const { error: convError } = await db
    .from("chat_conversations")
    .update({
      last_message_at: now,
      unread_count: 0,
      status: "human",
      taken_over_by: email,
      taken_over_at: now,
      message_count: (conversation.message_count ?? 0) + 1,
    })
    .eq("id", params.id)
  if (convError) journalErrors.push(`chat_conversations: ${convError.message}`)

  return NextResponse.json({
    ok: true,
    sentAt: now,
    ...(journalErrors.length > 0
      ? { warning: `envoyé à la cliente, mais journalisation partielle : ${journalErrors.join(" ; ")}` }
      : {}),
  })
}
