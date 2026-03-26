"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  ShoppingCart,
  Megaphone,
  Mail,
  Calendar,
  FolderKanban,
  Users,
  FileSpreadsheet,
  Bot,
  Settings,
  Sparkles,
  Target,
  Radar,
  Gift,
  Menu,
  X,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Acquisition", href: "/acquisition", icon: Radar },
  { name: "Ventes", href: "/sales", icon: ShoppingCart },
  { name: "Meta Ads", href: "/ads", icon: Megaphone },
  { name: "Klaviyo", href: "/klaviyo", icon: Mail },
  { name: "Influenceurs", href: "/influencers", icon: Users },
  { name: "Calendrier", href: "/calendar", icon: Calendar },
  { name: "Projets", href: "/projects", icon: FolderKanban },
  { name: "Objectifs 2026", href: "/objectives", icon: Target },
  { name: "Générosité", href: "/generosite", icon: Gift },
  { name: "P&L", href: "/pnl", icon: FileSpreadsheet },
  { name: "Agents", href: "/agents", icon: Bot },
]

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md border border-zinc-200 lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5 text-zinc-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-zinc-900" />
            <span className="text-lg font-bold text-zinc-900">Talika Admin</span>
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-100 lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Agent status footer */}
        <div className="border-t border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-500">Agents actifs</span>
          </div>
          <Link
            href="/agents"
            className="mt-2 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Gérer les agents
          </Link>
        </div>
      </aside>
    </>
  )
}
