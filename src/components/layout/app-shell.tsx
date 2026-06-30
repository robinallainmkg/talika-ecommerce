"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { sectionForPath } from "@/lib/roles"
import { useMarket, MarketEmptyState } from "@/components/layout/market-gate"

const BARE_PREFIXES = ["/login", "/auth"]

// Sections SANS connecteur UK → en mode UK on n'affiche aucune donnée FR (état vide).
const FR_ONLY_SECTIONS = new Set(["dashboard", "acquisition", "performance", "opportunites"])
const SECTION_TITLE: Record<string, string> = {
  dashboard: "Dashboard", acquisition: "Acquisition", performance: "Performance", opportunites: "Opportunités",
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const market = useMarket()
  const bare = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))

  if (bare) {
    return <main className="min-h-screen bg-zinc-50">{children}</main>
  }

  const section = sectionForPath(pathname)
  const gated = market === "UK" && !!section && FR_ONLY_SECTIONS.has(section)

  return (
    <>
      <Sidebar />
      <main className="min-h-screen bg-zinc-50 lg:ml-64">
        {gated ? (
          // En UK gated, on ne rend pas la page (état vide) MAIS on garde le
          // Header commun → le switch marché reste accessible (sinon on est
          // coincé en UK sans pouvoir revenir en FR).
          <>
            <Header title={SECTION_TITLE[section!] || section!} />
            <MarketEmptyState section={SECTION_TITLE[section!] || section!} />
          </>
        ) : children}
      </main>
    </>
  )
}
