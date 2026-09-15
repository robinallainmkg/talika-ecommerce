/**
 * Contrôle quotidien : commission enregistrée ≠ ventes × taux ?
 *
 * Pourquoi ce garde-fou (incident du 15/09/2026) :
 *  - `influencer_commissions.amount` est une valeur FIGÉE (une saisie humaine) ;
 *    elle ne se recalcule jamais. Quand les ventes du mois changent APRÈS la
 *    saisie, le montant reste faux en silence.
 *  - Ça arrive dès qu'un code promo est rattaché en retard : le matching ne
 *    repasse que sur le mois courant + le précédent, donc les ventes d'un mois
 *    clos peuvent bouger une fois (vécu : AURELIE20 créé le 15/09 → août passé
 *    de 261 € à 4 654 €, commission restée à 7,25 € au lieu de 372,30 €).
 *  - Et une course d'interface avait fait enregistrer 9 commissions d'août avec
 *    les suggestions de septembre.
 *
 * On NE corrige RIEN automatiquement : une commission peut légitimement différer
 * du calcul (montant négocié, régularisation). On signale, un humain tranche.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendMail } from "@/lib/mailer"

/** Écart ignoré en dessous (arrondis) et seuil d'alerte sur le total. */
const MIN_ECART_EUR = 1
const ALERTE_TOTAL_EUR = Number(process.env.COMMISSION_DRIFT_ALERT_EUR || 50)
const ALERT_TO = process.env.CHAT_COST_ALERT_EMAIL || "robinallainmkg@gmail.com"
/** Mois contrôlés : le courant + les 2 précédents (au-delà, plus rien ne bouge). */
const MOIS_CONTROLES = 3

export interface Ecart {
  name: string
  year: number
  month: number
  saved: number
  expected: number
  sales: number
  rate: number
}

const pad = (n: number) => String(n).padStart(2, "0")

export async function checkCommissionDrift(
  supabase: SupabaseClient,
  now = new Date()
): Promise<string> {
  const [{ data: influencers }, { data: rates }] = await Promise.all([
    supabase.from("influencers").select("id, name, commission_rate"),
    supabase.from("influencer_commission_rates").select("influencer_id, year, month, rate"),
  ])
  const infById = new Map((influencers || []).map((i: any) => [i.id, i]))

  /** Taux effectif = dernier taux saisi <= (year,month), sinon celui de la fiche. */
  const rateFor = (infId: string, year: number, month: number): number => {
    const target = year * 12 + (month - 1)
    let best: { rate: number; period: number } | null = null
    for (const r of (rates || []) as any[]) {
      if (r.influencer_id !== infId) continue
      const p = Number(r.year) * 12 + (Number(r.month) - 1)
      if (p > target) continue
      if (!best || p > best.period) best = { rate: Number(r.rate) || 0, period: p }
    }
    return best ? best.rate : Number(infById.get(infId)?.commission_rate) || 0
  }

  const ecarts: Ecart[] = []
  for (let back = 0; back < MOIS_CONTROLES; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const start = new Date(year, month - 1, 1).toISOString()
    const end = new Date(year, month, 1).toISOString()

    const [{ data: saved }, { data: sales }] = await Promise.all([
      supabase.from("influencer_commissions").select("influencer_id, amount").eq("year", year).eq("month", month),
      supabase.from("influencer_product_sales").select("influencer_id, line_price").gte("order_date", start).lt("order_date", end),
    ])
    if (!saved || saved.length === 0) continue

    const salesBy = new Map<string, number>()
    for (const s of (sales || []) as any[]) {
      salesBy.set(s.influencer_id, (salesBy.get(s.influencer_id) || 0) + Number(s.line_price || 0))
    }

    for (const c of saved as any[]) {
      const rate = rateFor(c.influencer_id, year, month)
      if (rate <= 0) continue // pas de taux → commission forcément négociée, rien à comparer
      const sold = salesBy.get(c.influencer_id) || 0
      const expected = Math.round((sold * rate) / 100 * 100) / 100
      const savedAmount = Number(c.amount || 0)
      if (Math.abs(savedAmount - expected) < MIN_ECART_EUR) continue
      ecarts.push({
        name: infById.get(c.influencer_id)?.name || "?",
        year, month,
        saved: savedAmount,
        expected,
        sales: Math.round(sold * 100) / 100,
        rate,
      })
    }
  }

  const totalEcart = Math.round(ecarts.reduce((s, e) => s + Math.abs(e.saved - e.expected), 0) * 100) / 100
  const stamp = now.toISOString()
  const in60d = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()

  await supabase.from("data_cache").upsert(
    {
      key: "fr:influence:commission_drift",
      data: { computed_at: stamp, total_ecart_eur: totalEcart, count: ecarts.length, ecarts },
      source: "cron",
      updated_at: stamp,
      expires_at: in60d,
    },
    { onConflict: "key" }
  )

  if (ecarts.length === 0) return "aucun écart"

  let note = ""
  if (totalEcart >= ALERTE_TOTAL_EUR) {
    // Une alerte par mois civil ET par montant total : si l'écart change, on
    // réalerte ; s'il stagne (écart assumé), on se tait.
    const alertKey = `fr:influence:drift_alert:${now.getFullYear()}-${pad(now.getMonth() + 1)}:${Math.round(totalEcart)}`
    const { data: already } = await supabase.from("data_cache").select("key").eq("key", alertKey).maybeSingle()
    if (already) {
      note = " — déjà signalé"
    } else {
      const lignes = ecarts
        .sort((a, b) => Math.abs(b.saved - b.expected) - Math.abs(a.saved - a.expected))
        .map((e) => `• ${e.name} — ${pad(e.month)}/${e.year} : ${e.saved} € saisis, ${e.expected} € attendus (${e.sales} € de ventes × ${e.rate} %)`)
      const r = await sendMail({
        to: ALERT_TO,
        subject: `⚠️ Commissions influence : ${ecarts.length} écart${ecarts.length > 1 ? "s" : ""} (${totalEcart} €)`,
        text: [
          `Des commissions enregistrées ne correspondent plus aux ventes × taux :`,
          ``,
          ...lignes,
          ``,
          `Rappel : le montant enregistré est figé, il ne se recalcule pas. Un écart est`,
          `normal si le montant a été négocié — sinon il faut corriger la saisie.`,
          ``,
          `Page : https://talika-ecommerce.vercel.app/influencers/couts`,
        ].join("\n"),
      })
      if (r.ok) {
        await supabase.from("data_cache").upsert(
          { key: alertKey, data: { sent_at: stamp, total_ecart_eur: totalEcart, count: ecarts.length }, source: "cron", updated_at: stamp, expires_at: in60d },
          { onConflict: "key" }
        )
        note = ` — alerte envoyée à ${ALERT_TO}`
      } else {
        note = ` — alerte NON envoyée (${r.error})`
      }
    }
  }

  return `${ecarts.length} écart${ecarts.length > 1 ? "s" : ""} (${totalEcart} €)${note}`
}
