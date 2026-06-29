"use client"

import { MarketSwitch } from "@/components/layout/market-switch"

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

// Header global uniforme : titre + sous-titre à gauche, actions de page puis le
// switch marché (FR/UK) à droite. Plus de boutons fantômes (recherche/cloche/
// refresh) qui ne faisaient rien — remplacés par le switch marché, utile partout
// puisque le companion est dupliqué par marché.
export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex min-h-[4rem] items-center justify-between gap-2 border-b border-zinc-200 bg-white/80 px-4 sm:px-6 backdrop-blur-sm py-2">
      <div className="pl-12 lg:pl-0 min-w-0 flex-1">
        <h1 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-zinc-500 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {actions}
        <MarketSwitch />
      </div>
    </header>
  )
}
