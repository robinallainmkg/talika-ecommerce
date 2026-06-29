// Multi-marché (périmètre) — un seul companion, switch FR/UK.
// Le marché courant est porté par un cookie (tk_market) côté navigateur et passé
// en query param (?market=) aux API. Les données influence sont scopées par
// la colonne `influencers.market`. Cf. CLAUDE.md §7 (nommage scopé par marché).

export const MARKETS = ["FR", "UK"] as const
export type Market = (typeof MARKETS)[number]
export const DEFAULT_MARKET: Market = "FR"
export const MARKET_COOKIE = "tk_market"

export const MARKET_LABELS: Record<Market, string> = {
  FR: "France",
  UK: "United Kingdom",
}
export const MARKET_FLAG: Record<Market, string> = { FR: "🇫🇷", UK: "🇬🇧" }

export function normalizeMarket(v: string | null | undefined): Market {
  const up = (v || "").toUpperCase()
  return (MARKETS as readonly string[]).includes(up) ? (up as Market) : DEFAULT_MARKET
}
