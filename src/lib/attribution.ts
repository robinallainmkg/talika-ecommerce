/**
 * Attribution par commande — partition déterministe du CA (somme = 100 %).
 *
 * Règle de priorité (validée par Robin) : le CODE INFLUENCEUR gagne toujours.
 * Une vente avec code que Meta revendique en last-click revient à l'influence ;
 * l'overlap (code + marqueur pub dans la session d'achat) n'est pas perdu :
 * il est MESURÉ et affiché à part sur /acquisition.
 *
 * Classifieur calibré sur les données réelles de juin 2026 (946 commandes) :
 *  - gclid / wbraid / gbraid → Google Ads (auto-tagging, fiable, paid-only)
 *  - fbclid → Meta (⚠ posé aussi sur des clics organiques FB/IG → notre "meta_ads"
 *    est un MAJORANT du paid last-session ; assumé et documenté dans l'UI)
 *  - utm_source=Klaviyo → Email
 *  - referrer moteur de recherche sans click-id → SEO
 *  - le reste (landing null = consent refusé / app, direct, social organique) → Direct
 *
 * Les champs landing_site / referring_site sont posés par le sync (run-all.ts)
 * depuis juin 2026. Les mois plus anciens ne les ont pas → utmCoverage permet à
 * l'UI d'afficher "non séparable" plutôt qu'un faux 100 % direct.
 */

export type AttributionChannel =
  | "influence"
  | "google_ads"
  | "meta_ads"
  | "email"
  | "seo"
  | "direct"

export interface CachedOrder {
  total_price?: string
  discount_codes?: Array<{ code?: string } | string>
  landing_site?: string | null
  referring_site?: string | null
  source_name?: string | null
}

const SEARCH_ENGINES = /(^|\.)(google|bing|ecosia|duckduckgo|qwant|yahoo|startpage|brave)\.[a-z.]+$/i

function landingParams(landing: string): URLSearchParams {
  const qIndex = landing.indexOf("?")
  if (qIndex === -1) return new URLSearchParams()
  try {
    return new URLSearchParams(landing.slice(qIndex + 1))
  } catch {
    return new URLSearchParams()
  }
}

function refHost(ref: string): string {
  const m = ref.match(/^https?:\/\/(?:www\.|l\.|lm\.|m\.)?([^/:]+)/i)
  return m ? m[1].toLowerCase() : ""
}

/** Marqueur pub dans la session d'achat (indépendant du code promo). */
export function paidTouch(order: CachedOrder): "meta" | "google" | null {
  const landing = order.landing_site || ""
  if (!landing) return null
  if (/[?&](gclid|wbraid|gbraid)=/.test(landing)) return "google"
  if (/[?&]fbclid=/.test(landing)) return "meta"
  const p = landingParams(landing)
  const src = (p.get("utm_source") || "").toLowerCase()
  const medium = (p.get("utm_medium") || "").toLowerCase()
  const isPaidMedium = /^(cpc|ppc|paid|paid_social|paidsocial)$/.test(medium)
  if (isPaidMedium && /^(facebook|fb|instagram|ig|meta)$/.test(src)) return "meta"
  if (isPaidMedium && src === "google") return "google"
  return null
}

/** true si la commande porte un code de la liste (codes influenceurs actifs). */
export function hasInfluencerCode(order: CachedOrder, codeSet: Set<string>): boolean {
  return (order.discount_codes || []).some((d) => {
    const code = (typeof d === "string" ? d : d.code || "").toUpperCase().trim()
    return codeSet.has(code)
  })
}

/** Canal d'attribution de la commande. Priorité : code > pub > email > SEO > direct. */
export function classifyOrder(order: CachedOrder, codeSet: Set<string>): AttributionChannel {
  if (hasInfluencerCode(order, codeSet)) return "influence"
  const touch = paidTouch(order)
  if (touch === "google") return "google_ads"
  if (touch === "meta") return "meta_ads"
  const landing = order.landing_site || ""
  const src = (landingParams(landing).get("utm_source") || "").toLowerCase()
  if (src.includes("klaviyo") || landingParams(landing).get("utm_medium") === "email") return "email"
  const host = refHost(order.referring_site || "")
  if (host && SEARCH_ENGINES.test(host)) return "seo"
  return "direct"
}

/** Part des commandes qui portent les champs d'attribution (mois anciens = 0). */
export function utmCoverage(orders: CachedOrder[]): number {
  if (orders.length === 0) return 0
  const withField = orders.filter((o) => "landing_site" in o).length
  return withField / orders.length
}
