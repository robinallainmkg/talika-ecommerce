"use client"

import { cn } from "@/lib/utils"

export const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
]
export const MONTHS_FULL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

const DEFAULT_YEARS = [2024, 2025, 2026]

// Strip d'onglets de mois, partagé par les vues Influence (Facturation, Coûts,
// scoreboard, Campagnes). `badges` = compteur ambre par mois (1-12), optionnel.
// `allowAll` ajoute un onglet "Année" (sélection = null) pour les vues annuelles.
// `year`/`onYearChange` (optionnels) affichent le sélecteur d'année DANS le strip,
// juste à côté des mois — pour une barre période uniforme dans toutes les vues.
export function MonthTabs({
  month,
  onSelect,
  badges,
  allowAll = false,
  className,
  year,
  onYearChange,
  years = DEFAULT_YEARS,
}: {
  month: number | null
  onSelect: (m: number | null) => void
  badges?: Record<number, number>
  allowAll?: boolean
  className?: string
  year?: number
  onYearChange?: (y: number) => void
  years?: number[]
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1", className)}>
      {year != null && onYearChange && (
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="mr-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 focus:border-zinc-900 focus:outline-none"
          aria-label="Année"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {allowAll && (
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            month === null ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-900"
          )}
        >
          Année
        </button>
      )}
      {MONTHS_SHORT.map((m, i) => {
        const mn = i + 1
        const active = month === mn
        const count = badges?.[mn] || 0
        return (
          <button
            key={i}
            onClick={() => onSelect(mn)}
            title={count > 0 ? `${MONTHS_FULL[i]} — ${count}` : MONTHS_FULL[i]}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-900"
            )}
          >
            {m}
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  active ? "bg-amber-400 text-zinc-900" : "bg-amber-100 text-amber-700"
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
