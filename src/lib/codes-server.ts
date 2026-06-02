import { createClient } from "@supabase/supabase-js"
import { normalizeCode } from "./codes"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export interface UncategorizedCode {
  code: string
  orders: number
  revenue: number
  discount: number
}

// Codes promo VRAIMENT non catégorisés = vus dans les commandes du mois (ou dans la
// liste des codes Shopify de l'année) ET absents de `influencer_codes` — avec matching
// NORMALISÉ (espaces/accents/casse) pour ne plus jamais ressortir un code déjà catégorisé.
// Source unique utilisée par /api/influencers/unassigned ET /api/routine → un seul
// chiffre fiable (page + notification badge identiques).
export async function getUncategorizedCodes(
  year: number,
  month: number
): Promise<UncategorizedCode[]> {
  const [codesRes, discountRes, ordersRes] = await Promise.all([
    supabase.from("influencer_codes").select("code"),
    supabase.from("data_cache").select("data").eq("key", `shopify_discount_codes_${year}`).single(),
    supabase.from("data_cache").select("data").eq("key", `shopify_orders_${year}_${month}`).single(),
  ])

  // Ensemble NORMALISÉ des codes déjà catégorisés (toutes catégories confondues)
  const categorized = new Set(
    (codesRes.data || []).map((c: { code: string }) => normalizeCode(c.code))
  )

  const rawCodes = Array.isArray(discountRes.data?.data) ? discountRes.data.data : []
  const ordersData = ordersRes.data?.data as { orders?: any[] } | null
  const orders = Array.isArray(ordersData?.orders) ? ordersData!.orders! : []

  // Stats d'usage par code (clé = normalisée, libellé = version lisible)
  const stats: Record<string, UncategorizedCode> = {}
  const bump = (raw: string): UncategorizedCode | null => {
    const key = normalizeCode(raw)
    if (!key) return null
    if (!stats[key]) stats[key] = { code: (raw || "").trim(), orders: 0, revenue: 0, discount: 0 }
    return stats[key]
  }

  for (const order of orders) {
    if (order.cancelled_at) continue
    for (const dc of order.discount_codes || []) {
      const s = bump(dc.code || "")
      if (!s) continue
      s.orders += 1
      s.revenue += parseFloat(order.total_price || "0")
      s.discount += parseFloat(dc.amount || "0")
    }
  }
  // Inclure aussi les codes Shopify connus (même sans commande ce mois)
  for (const c of rawCodes) bump(c.code || "")

  return Object.entries(stats)
    .filter(([key]) => !categorized.has(key))
    .map(([, v]) => v)
    .sort((a, b) => b.revenue - a.revenue)
}
