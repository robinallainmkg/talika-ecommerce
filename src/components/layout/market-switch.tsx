"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Switch de marché (périmètre) FR / UK. Le marché courant est porté par le cookie
// `tk_market`, PARTAGÉ avec le switch de la sidebar (même cookie → les deux restent
// synchronisés sans état global). Changer de marché écrit le cookie puis recharge :
// les vues lisent `getMarketCookie()` et passent ?market= à leurs fetchs.
// Constantes volontairement inline (autonomie : pas de couplage avec src/lib/market.ts
// en cours sur une autre session). Cf. CLAUDE.md §7 (nommage scopé par marché).

const MARKETS = ["FR", "UK"] as const
type Market = (typeof MARKETS)[number]
const FLAG: Record<Market, string> = { FR: "🇫🇷", UK: "🇬🇧" }
const LABEL: Record<Market, string> = { FR: "France", UK: "United Kingdom" }

export function getMarketCookie(): Market {
  if (typeof document === "undefined") return "FR"
  const m = document.cookie.match(/(?:^|; )tk_market=(FR|UK)/)
  return m?.[1] === "UK" ? "UK" : "FR"
}

export function MarketSwitch({ className }: { className?: string }) {
  const [market, setMarket] = useState<Market>("FR")
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
          title={LABEL[m]}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            market === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          <span>{FLAG[m]}</span>
          <span>{m}</span>
        </button>
      ))}
    </div>
  )
}
