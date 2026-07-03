"use client"

import { useEffect, useRef, useState } from "react"

// Période (année + mois) des vues Influence, avec mémoire :
//   1. URL (?year=2026&month=6, month=all pour la vue annuelle) — prioritaire :
//      rechargement, lien partagé, back/forward conservent la sélection.
//   2. localStorage (clé partagée) — fallback quand on arrive sans paramètre :
//      choisir Juin dans Coûts puis ouvrir Facturation garde Juin.
// L'URL est réécrite via history.replaceState (pas de rechargement, pas d'entrée
// d'historique par clic de tab).

const LS_KEY = "tk_influence_period"

function usePeriodBase(allowAll: boolean, defaultMonth: number | null) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState<number | null>(defaultMonth)
  const ready = useRef(false)
  const [initialized, setInitialized] = useState(false)

  // Lecture initiale : URL sinon localStorage sinon mois courant.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let y = parseInt(params.get("year") || "")
    let mRaw: string | null = params.get("month")
    if (!y && !mRaw) {
      try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null") as { year?: number; month?: string } | null
        if (saved) { y = Number(saved.year); mRaw = saved.month ?? null }
      } catch { /* ignore */ }
    }
    if (y >= 2024 && y <= 2032) setYear(y)
    if (mRaw === "all") { if (allowAll) setMonth(null) }
    else {
      const m = parseInt(mRaw || "")
      if (m >= 1 && m <= 12) setMonth(m)
    }
    ready.current = true
    setInitialized(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Écriture : URL (replace, sans navigation) + mémoire partagée.
  useEffect(() => {
    if (!ready.current) return
    const params = new URLSearchParams(window.location.search)
    params.set("year", String(year))
    params.set("month", month == null ? "all" : String(month))
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
    try { localStorage.setItem(LS_KEY, JSON.stringify({ year, month: month == null ? "all" : String(month) })) } catch { /* ignore */ }
  }, [year, month, initialized])

  return { year, setYear, month, setMonth }
}

// Vues à mois obligatoire (Coûts, Facturation) : month est toujours un nombre.
export function usePeriod() {
  const p = usePeriodBase(false, new Date().getMonth() + 1)
  return { ...p, month: p.month ?? new Date().getMonth() + 1 }
}

// Vue avec onglet "Année" (scoreboard Influenceurs) : month peut être null
// (défaut = année complète, comme avant).
export function usePeriodWithAll() {
  return usePeriodBase(true, null)
}
