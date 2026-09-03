"use client"

import { useEffect, useState } from "react"
import { DEFAULT_MARKET, MARKET_FLAG, normalizeMarket, type Market } from "@/lib/market"

// Marché courant côté client (cookie tk_market, posé par le switch marché du header).
// ⚠️ Init synchrone depuis le cookie : avec un défaut "FR" corrigé en useEffect, la
// page fetchait d'abord market=FR puis market=UK, et la réponse FR (plus lourde)
// pouvait arriver en dernier → données FR affichées en mode UK (bug campagnes 09/07).
function readMarketCookie(): Market {
  if (typeof document === "undefined") return DEFAULT_MARKET
  return normalizeMarket(document.cookie.match(/(?:^|; )tk_market=([A-Za-z]{2})/)?.[1])
}

export function useMarket(): Market {
  const [m, setM] = useState<Market>(readMarketCookie)
  // Resynchronise après hydratation (le rendu serveur suppose FR).
  useEffect(() => {
    setM(readMarketCookie())
  }, [])
  return m
}

// État vide affiché hors FR pour les sections sans connecteur sur ce marché (zéro donnée FR).
export function MarketEmptyState({ section }: { section: string }) {
  const market = useMarket()
  return (
    <div className="flex min-h-[75vh] items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">
          {MARKET_FLAG[market]}
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">{section} — marché {market}</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Pas encore de connecteur {market} pour cette section. Aucune donnée FR n&apos;est affichée en mode {market}.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          Pour l&apos;instant, seule l&apos;<strong>Influence</strong> a des données {market} (prospection / outreach).
          Repasse en 🇫🇷 FR pour les données France.
        </p>
      </div>
    </div>
  )
}
