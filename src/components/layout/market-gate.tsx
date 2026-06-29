"use client"

import { useEffect, useState } from "react"

// Marché courant côté client (cookie tk_market, posé par le switch FR/UK du header).
export function useMarket(): "FR" | "UK" {
  const [m, setM] = useState<"FR" | "UK">("FR")
  useEffect(() => {
    const x = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )tk_market=(FR|UK)/) : null
    setM(x?.[1] === "UK" ? "UK" : "FR")
  }, [])
  return m
}

// État vide affiché en mode UK pour les sections sans connecteur UK (zéro donnée FR).
export function MarketEmptyState({ section }: { section: string }) {
  return (
    <div className="flex min-h-[75vh] items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl">🇬🇧</div>
        <h2 className="text-lg font-semibold text-zinc-900">{section} — marché UK</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Pas encore de connecteur UK pour cette section. Aucune donnée FR n&apos;est affichée en mode UK.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          Pour l&apos;instant, seule l&apos;<strong>Influence</strong> a des données UK (prospection / outreach).
          Repasse en 🇫🇷 FR pour les données France.
        </p>
      </div>
    </div>
  )
}
