"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { MARKETS, MARKET_FLAG, MARKET_LABELS, DEFAULT_MARKET, normalizeMarket, type Market } from "@/lib/market"

// Switch de marché (périmètre) FR / UK / US. Le marché courant est porté par le cookie
// `tk_market`, PARTAGÉ avec le switch de la sidebar (même cookie → les deux restent
// synchronisés sans état global). Changer de marché écrit le cookie puis recharge :
// les vues lisent `getMarketCookie()` et passent ?market= à leurs fetchs.
// Constantes lues depuis src/lib/market.ts : une regex `(FR|UK)` inline ferait retomber
// silencieusement tout nouveau marché sur FR. Cf. CLAUDE.md §7 (nommage scopé par marché).

export function getMarketCookie(): Market {
  if (typeof document === "undefined") return DEFAULT_MARKET
  return normalizeMarket(document.cookie.match(/(?:^|; )tk_market=([A-Za-z]{2})/)?.[1])
}

export function MarketSwitch({ className }: { className?: string }) {
  const [market, setMarket] = useState<Market>(DEFAULT_MARKET)
  useEffect(() => setMarket(getMarketCookie()), [])

  const switchTo = (m: Market) => {
    if (m === market) return
    document.cookie = `tk_market=${m}; path=/; max-age=31536000`
    window.location.reload()
  }

  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5", className)}>
      {MARKETS.map((m) => (
        <button
          key={m}
          onClick={() => switchTo(m)}
          title={MARKET_LABELS[m]}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            market === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <span>{MARKET_FLAG[m]}</span>
          <span>{m}</span>
        </button>
      ))}
    </div>
  )
}
