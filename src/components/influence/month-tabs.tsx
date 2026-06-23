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

// Strip d'onglets de mois, partagé par les vues Influence (Facturation, Coûts,
// scoreboard). `badges` = compteur ambre par mois (1-12), optionnel.
// `allowAll` ajoute un onglet "Année" (sélection = null) pour les vues annuelles.
export function MonthTabs({
  month,
  onSelect,
  badges,
  allowAll = false,
  className,
}: {
  month: number | null
  onSelect: (m: number | null) => void
  badges?: Record<number, number>
  allowAll?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1", className)}>
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
