/**
 * Garde-fou coût du chat IA (Mistral) — étape "chat_cost" du cron quotidien.
 *
 * Mistral ne pousse aucune alerte : le 04/09/2026 le PAYG a sauté et le bot a
 * tourné 11 jours en fallback sans que personne ne le voie. Ici on fait
 * l'inverse : on ESTIME chaque jour la dépense du mois depuis `chat_messages`
 * (tokens_used par réponse) et on envoie UN email à Robin si elle dépasse la
 * limite. Le plafond DUR reste à poser dans la console Mistral (Billing →
 * Limits) — ce module ne peut qu'alerter, pas couper.
 *
 * Tarifs : tokens_used = entrée + sortie confondus → taux mélangé €/M tokens,
 * volontairement arrondi vers le HAUT (mieux vaut alerter trop tôt). À ajuster
 * si Mistral change ses prix. Réel observé août 2026 : 1,1 M tokens ≈ 0,20 €.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"

const EUR_PER_M_TOKENS: Record<string, number> = {
  "mistral-small-latest": 0.25,
  "mistral-medium-latest": 1.2,
}
const DEFAULT_RATE = 1.2 // modèle inconnu → on prend le plus cher

export const CHAT_COST_LIMIT_EUR = Number(process.env.CHAT_COST_LIMIT_EUR || 8)
const ALERT_TO = process.env.CHAT_COST_ALERT_EMAIL || "robinallainmkg@gmail.com"

const pad = (n: number) => String(n).padStart(2, "0")

export async function checkChatCost(supabase: SupabaseClient, now = new Date()): Promise<string> {
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data, error } = await supabase
    .from("chat_messages")
    .select("model, tokens_used")
    .eq("role", "assistant")
    .like("model", "mistral%")
    .gte("created_at", monthStart)
  if (error) throw new Error(`chat_messages: ${error.message}`)

  let tokens = 0
  let eur = 0
  let responses = 0
  for (const r of (data || []) as { model: string; tokens_used: number | null }[]) {
    const t = Number(r.tokens_used || 0)
    tokens += t
    responses++
    eur += (t / 1_000_000) * (EUR_PER_M_TOKENS[r.model] ?? DEFAULT_RATE)
  }
  eur = Math.round(eur * 100) / 100
  const over = eur >= CHAT_COST_LIMIT_EUR
  const stamp = now.toISOString()
  const in60d = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()

  // Snapshot lisible par le dashboard / la routine.
  await supabase.from("data_cache").upsert(
    {
      key: `fr:chat:cost:${ym}`,
      data: { month: ym, responses, tokens, estimated_eur: eur, limit_eur: CHAT_COST_LIMIT_EUR, over, computed_at: stamp },
      source: "cron",
      updated_at: stamp,
      expires_at: in60d,
    },
    { onConflict: "key" }
  )

  let alertNote = ""
  if (over) {
    const alertKey = `fr:chat:cost_alert:${ym}`
    const { data: already } = await supabase.from("data_cache").select("key").eq("key", alertKey).maybeSingle()
    if (already) {
      alertNote = " — alerte déjà envoyée ce mois"
    } else {
      const r = await sendMail({
        to: ALERT_TO,
        subject: `⚠️ Chat IA Talika : ${eur} € estimés en ${ym} (limite ${CHAT_COST_LIMIT_EUR} €)`,
        text: [
          `Le chat IA talika.fr a consommé environ ${eur} € de Mistral depuis le début du mois (${responses} réponses, ${Math.round(tokens / 1000)} k tokens).`,
          `Limite fixée : ${CHAT_COST_LIMIT_EUR} €/mois. Estimation volontairement pessimiste.`,
          ``,
          `Ce mail ne coupe rien : le plafond dur se règle dans la console Mistral (Billing → Limits).`,
          `Si la conso est anormale (boucle, spam), désactive le bot dans Companion → Chat → Réglages (bot_enabled).`,
          ``,
          `Détail : https://talika-ecommerce.vercel.app/chat`,
        ].join("\n"),
      })
      if (r.ok) {
        await supabase.from("data_cache").upsert(
          { key: alertKey, data: { sent_at: stamp, estimated_eur: eur, to: ALERT_TO }, source: "cron", updated_at: stamp, expires_at: in60d },
          { onConflict: "key" }
        )
        alertNote = ` — alerte envoyée à ${ALERT_TO}`
      } else {
        alertNote = ` — alerte NON envoyée (${r.error})`
      }
    }
  }

  return `${ym} : ${responses} réponses, ${Math.round(tokens / 1000)} k tokens ≈ ${eur} € / ${CHAT_COST_LIMIT_EUR} €${over ? " ⚠️ LIMITE DÉPASSÉE" : ""}${alertNote}`
}
