// Multi-marché (périmètre) — un seul companion, switch FR/UK/US.
// Le marché courant est porté par un cookie (tk_market) côté navigateur et passé
// en query param (?market=) aux API. Les données influence sont scopées par
// la colonne `influencers.market`. Cf. CLAUDE.md §7 (nommage scopé par marché).

export const MARKETS = ["FR", "UK", "US"] as const
export type Market = (typeof MARKETS)[number]
export const DEFAULT_MARKET: Market = "FR"
export const MARKET_COOKIE = "tk_market"

export const MARKET_LABELS: Record<Market, string> = {
  FR: "France",
  UK: "United Kingdom",
  US: "United States",
}
export const MARKET_FLAG: Record<Market, string> = { FR: "🇫🇷", UK: "🇬🇧", US: "🇺🇸" }

// Devise d'affichage par marché (montants collab quand la fiche ne porte pas sa devise).
export const MARKET_CURRENCY: Record<Market, string> = { FR: "EUR", UK: "GBP", US: "USD" }

// Signature des emails d'outreach, par marché de l'influenceuse.
export const MARKET_SENDER: Record<Market, string> = {
  FR: "Robin · Talika",
  UK: "Robin · Talika UK",
  US: "Robin · Talika US",
}

// Marchés dont la boîte est branchée en envoi in-app (Resend + IMAP).
// FR reste en lecture seule tant que Microsoft Graph n'est pas branché (cf. CLAUDE.md §12).
const REPLY_MARKETS = new Set<Market>(["UK", "US"])
export function canReplyFromApp(market: Market): boolean {
  return REPLY_MARKETS.has(market)
}

export function normalizeMarket(v: string | null | undefined): Market {
  const up = (v || "").toUpperCase()
  return (MARKETS as readonly string[]).includes(up) ? (up as Market) : DEFAULT_MARKET
}

// Côté serveur (routes API) : marché de la requête = ?market= sinon cookie
// tk_market, sinon FR. À utiliser dans TOUTE route influence qui renvoie des
// listes (sinon les données FR fuient en mode UK).
export function marketFromRequest(request: Request): Market {
  const param = new URL(request.url).searchParams.get("market")
  if (param) return normalizeMarket(param)
  const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)tk_market=([A-Za-z]{2})/)?.[1]
  return normalizeMarket(cookie)
}
