import { createClient } from "@supabase/supabase-js"
import { normalizeCode, GENEROSITE_EXCLUDED_TYPES } from "./codes"

// Charge la table de catégorisation = SOURCE DE VÉRITÉ (influencer_codes.code_type).
// Clé = code normalisé (cf normalizeCode) → catégorie. JAMAIS de regex en dur.
export async function loadCodeCategoryMap(): Promise<Map<string, string>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } }
  )
  const { data } = await supabase.from("influencer_codes").select("code, code_type")
  const map = new Map<string, string>()
  for (const c of data || []) {
    if (c.code) map.set(normalizeCode(c.code), c.code_type || "autre")
  }
  return map
}

export interface GenerositeResult {
  total_orders: number
  total_revenue: number // CA net (après remises + remboursements)
  total_discount: number // somme des total_discounts
  prix_barres: number
  ca_brut: number // valeur catalogue d'origine (dénominateur)
  generosite_rate: number // % — SAV exclu (cf knowledge_base glossary:generosite)
  by_category: Record<string, { discount: number; orders: number }>
}

// Calcul CANONIQUE de la générosité, identique partout (page /generosite, /objectives, companion).
// Formule documentée : (remises + prix barrés − SAV) / CA brut. Codes influenceurs INCLUS
// (stratégiques), SAV (service_client) EXCLU. Catégorisation 100% via la table (param categoryMap).
// Les soldes se font en compare_at_price → tombent dans prix_barres (démarques), pas dans un code.
export function computeGenerosite(
  orders: any[],
  categoryMap: Map<string, string>
): GenerositeResult {
  const by: Record<string, { discount: number; orders: number }> = {}
  const add = (cat: string, amount: number) => {
    if (!by[cat]) by[cat] = { discount: 0, orders: 0 }
    by[cat].discount += amount
    by[cat].orders += 1
  }
  const categorize = (code: string) => categoryMap.get(normalizeCode(code)) || "autre"

  let revenue = 0
  let totalDiscount = 0
  let prixBarres = 0
  let caBrut = 0
  let count = 0

  for (const o of orders) {
    if (o.financial_status === "voided" || o.cancelled_at) continue
    count++

    const totalPrice = parseFloat(o.total_price || "0")
    const refund = (o.refunds || []).reduce(
      (s: number, r: any) =>
        s + (r.transactions || []).reduce((t: number, x: any) => t + parseFloat(x.amount || "0"), 0),
      0
    )
    revenue += totalPrice - refund

    const orderDiscount = parseFloat(o.total_discounts || "0")
    totalDiscount += orderDiscount

    let codeSum = 0
    for (const dc of o.discount_codes || []) {
      const code = typeof dc === "string" ? dc : dc.code || ""
      const amount = parseFloat(typeof dc === "string" ? "0" : dc.amount || "0")
      codeSum += amount
      if (code) add(categorize(code), amount)
    }
    // Remises automatiques (volume, etc.) = écart entre total_discounts et la somme des codes
    const autoGap = orderDiscount - codeSum
    if (autoGap > 0) add("auto_discounts", autoGap)

    // Prix barrés + CA brut (valeur catalogue) depuis les line items
    for (const li of o.line_items || []) {
      const price = parseFloat(li.price || "0")
      const compareAt = parseFloat(li.compare_at_price || "0")
      const qty = li.quantity || 1
      const catalog = compareAt > price && compareAt > 0 ? compareAt : price
      caBrut += catalog * qty
      if (compareAt > price && compareAt > 0) prixBarres += (compareAt - price) * qty
    }
  }

  const excluded = GENEROSITE_EXCLUDED_TYPES.reduce((s, t) => s + (by[t]?.discount || 0), 0)
  const rate =
    caBrut > 0 ? Math.round(((totalDiscount + prixBarres - excluded) / caBrut) * 1000) / 10 : 0

  return {
    total_orders: count,
    total_revenue: Math.round(revenue),
    total_discount: Math.round(totalDiscount),
    prix_barres: Math.round(prixBarres),
    ca_brut: Math.round(caBrut),
    generosite_rate: rate,
    by_category: by,
  }
}
