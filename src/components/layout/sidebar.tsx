"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Megaphone,
  Mail,
  Calendar,
  FolderKanban,
  Users,
  FileSpreadsheet,
  Sparkles,
  Target,
  Radar,
  Gift,
  Lightbulb,
  MessageCircle,
  Menu,
  X,
  UserCog,
  LogOut,
} from "lucide-react"
import { authClient } from "@/lib/auth/client"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Opportunités", href: "/opportunities", icon: Lightbulb },
  { name: "Acquisition", href: "/acquisition", icon: Radar },

  { name: "Meta Ads", href: "/ads", icon: Megaphone },
  { name: "Klaviyo", href: "/klaviyo", icon: Mail },
  { name: "Influenceurs", href: "/influencers", icon: Users },
  { name: "Chat IA", href: "/chat", icon: MessageCircle },
  { name: "Calendrier", href: "/calendar", icon: Calendar },
  { name: "Projets", href: "/projects", icon: FolderKanban },
  { name: "Objectifs 2026", href: "/objectives", icon: Target },
  { name: "Générosité", href: "/generosite", icon: Gift },
  { name: "P&L", href: "/pnl", icon: FileSpreadsheet },
  { name: "Équipe", href: "/users", icon: UserCog },
]

interface RoutineCheck {
  id: string
  label: string
  status: "done" | "pending" | "warning"
  detail?: string
  link?: string
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, { count: number; labels: string[] }>>({})

  // Fetch routine to compute badges
  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/routine")
      const data = await res.json()
      if (!data.checks) return

      const pending = (data.checks as RoutineCheck[]).filter(
        (c) => (c.status === "pending" || c.status === "warning") && c.link
      )
      const grouped: Record<string, { count: number; labels: string[] }> = {}
      for (const check of pending) {
        const link = check.link!
        if (!grouped[link]) grouped[link] = { count: 0, labels: [] }
        grouped[link].count += 1
        grouped[link].labels.push(check.label)
      }
      setBadges(grouped)
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    fetchBadges()
  }, [fetchBadges])

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
              const badge = badges[item.href]
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    title={badge ? badge.labels.join(", ") : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1">{item.name}</span>
                    {badge && (
                      <span className={cn(
                        "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                        isActive
                          ? "bg-amber-400 text-zinc-900"
                          : "bg-amber-100 text-amber-700"
                      )}>
                        {badge.count}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Status footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-zinc-500">Sync actif</span>
          </div>
          <button
            onClick={async () => {
              await authClient().auth.signOut()
              window.location.href = "/login"
            }}
            className="flex items-center gap-1 rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
