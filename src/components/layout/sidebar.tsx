"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Calendar,
  FolderKanban,
  Users,
  Sparkles,
  Target,
  Radar,
  Lightbulb,
  MessageCircle,
  Menu,
  X,
  UserCog,
  LogOut,
  ChevronDown,
} from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { navVisible } from "@/lib/roles"

type Leaf = { name: string; href: string; icon?: typeof Users }
type Group = { name: string; icon: typeof Users; children: Leaf[] }
type Entry = (Leaf & { children?: undefined }) | Group

const NAV: Entry[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Opportunités", href: "/opportunities", icon: Lightbulb },
  {
    name: "Acquisition", icon: Radar, children: [
      { name: "Vue d'ensemble", href: "/acquisition" },
      { name: "Meta Ads", href: "/ads" },
      { name: "Klaviyo", href: "/klaviyo" },
    ],
  },
  {
    name: "Influence", icon: Users, children: [
      { name: "Influenceurs", href: "/influencers" },
      { name: "Campagnes", href: "/influencers/campagnes" },
      { name: "Coûts influence", href: "/influencers/couts" },
      { name: "Facturation", href: "/influencers/facturation" },
    ],
  },
  {
    name: "Performance", icon: Target, children: [
      { name: "Objectifs 2026", href: "/objectives" },
      { name: "Générosité", href: "/generosite" },
      { name: "P&L", href: "/pnl" },
    ],
  },
  { name: "Chat IA", href: "/chat", icon: MessageCircle },
  { name: "Calendrier", href: "/calendar", icon: Calendar },
  { name: "Projets", href: "/projects", icon: FolderKanban },
  { name: "Équipe", href: "/users", icon: UserCog },
]

const ALL_LEAVES: string[] = NAV.flatMap((e) => ("children" in e && e.children ? e.children.map((c) => c.href) : [e.href!]))

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  influence: "Influence",
  sav: "SAV",
  member: "Membre",
}

interface RoutineCheck { id: string; label: string; status: "done" | "pending" | "warning"; detail?: string; link?: string }

function Badge({ count, active }: { count: number; active: boolean }) {
  return (
    <span className={cn(
      "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
      active ? "bg-amber-400 text-zinc-900" : "bg-amber-100 text-amber-700"
    )}>{count}</span>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, { count: number; labels: string[] }>>({})
  const [role, setRole] = useState<string | null>(null)
  const [sections, setSections] = useState<unknown>(undefined)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // Rôle + sections de l'utilisateur → on filtre la navigation par section.
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await authClient().auth.getUser()
        setRole((data.user?.user_metadata?.role as string) ?? "member")
        setSections(data.user?.user_metadata?.sections)
        setUserEmail(data.user?.email ?? null)
      } catch {
        setRole("member")
      }
    })()
  }, [])

  // Navigation filtrée par sections effectives : un item hors périmètre disparaît,
  // et un groupe dont aucun enfant n'est visible disparaît aussi.
  const visibleNav = NAV.map((entry) => {
    if ("children" in entry && entry.children) {
      const children = entry.children.filter((c) => navVisible(c.href, role, sections))
      return children.length ? { ...entry, children } : null
    }
    return navVisible((entry as Leaf).href, role, sections) ? entry : null
  }).filter(Boolean) as Entry[]
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  // Le lien actif = le href le plus spécifique (le plus long) qui matche le chemin.
  const activeHref = useMemo(() => {
    let best = ""
    for (const href of ALL_LEAVES) {
      if (pathname === href || pathname?.startsWith(href + "/")) {
        if (href.length > best.length) best = href
      }
    }
    return best
  }, [pathname])

  const groupHasActive = useCallback(
    (g: Group) => g.children.some((c) => c.href === activeHref),
    [activeHref]
  )
  const isOpen = (g: Group) => openMap[g.name] ?? groupHasActive(g)

  const fetchBadges = useCallback(async () => {
    const grouped: Record<string, { count: number; labels: string[] }> = {}
    // Badges routine (ops mensuelle)
    try {
      const res = await fetch("/api/routine")
      const data = await res.json()
      const pending = ((data.checks as RoutineCheck[]) || []).filter((c) => (c.status === "pending" || c.status === "warning") && c.link)
      for (const check of pending) {
        const link = check.link!
        if (!grouped[link]) grouped[link] = { count: 0, labels: [] }
        grouped[link].count += 1
        grouped[link].labels.push(check.label)
      }
    } catch { /* silent */ }
    // Badge "collabs sans facture" sur Facturation (403 silencieux pour rôle sav)
    try {
      const res = await fetch("/api/influencers/billing/summary")
      const data = await res.json()
      if (data?.total_missing > 0) {
        grouped["/influencers/facturation"] = {
          count: data.total_missing,
          labels: [`${data.total_missing} collab(s) sans facture`],
        }
      }
    } catch { /* silent */ }
    // Badge opportunités en attente
    try {
      const res = await fetch("/api/opportunities?status=pending")
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        grouped["/opportunities"] = {
          count: data.length,
          labels: data.slice(0, 3).map((o: { title: string }) => o.title),
        }
      }
    } catch { /* silent */ }
    setBadges(grouped)
  }, [])

  useEffect(() => { fetchBadges() }, [fetchBadges])
  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [mobileOpen])

  const groupBadgeCount = (g: Group) => g.children.reduce((s, c) => s + (badges[c.href]?.count || 0), 0)

  return (
    <>
      <button onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md border border-zinc-200 lg:hidden"
        aria-label="Ouvrir le menu">
        <Menu className="h-5 w-5 text-zinc-700" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-zinc-900" />
            <span className="text-lg font-bold text-zinc-900">Talika</span>
          </div>
          <button onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-100 lg:hidden" aria-label="Fermer le menu">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleNav.map((entry) => {
              // ── Groupe pliable (sous-onglets) ──
              if ("children" in entry && entry.children) {
                const g = entry as Group
                const open = isOpen(g)
                const hasActive = groupHasActive(g)
                const gBadge = groupBadgeCount(g)
                return (
                  <li key={g.name}>
                    <button
                      onClick={() => setOpenMap((p) => ({ ...p, [g.name]: !open }))}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        hasActive ? "text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      )}
                    >
                      <g.icon className="h-5 w-5" />
                      <span className="flex-1 text-left">{g.name}</span>
                      {!open && gBadge > 0 && <Badge count={gBadge} active={false} />}
                      <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", open ? "" : "-rotate-90")} />
                    </button>
                    {open && (
                      <ul className="mt-1 ml-5 space-y-1 border-l border-zinc-200 pl-3">
                        {g.children.map((c) => {
                          const active = c.href === activeHref
                          const badge = badges[c.href]
                          return (
                            <li key={c.href}>
                              <Link href={c.href} title={badge ? badge.labels.join(", ") : undefined}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                                  active ? "bg-zinc-900 font-medium text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                                )}>
                                <span className="flex-1">{c.name}</span>
                                {badge && <Badge count={badge.count} active={active} />}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              }

              // ── Item simple ──
              const item = entry as Leaf
              const active = item.href === activeHref
              const badge = badges[item.href]
              const Icon = item.icon!
              return (
                <li key={item.href}>
                  <Link href={item.href} title={badge ? badge.labels.join(", ") : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    )}>
                    <Icon className="h-5 w-5" />
                    <span className="flex-1">{item.name}</span>
                    {badge && <Badge count={badge.count} active={active} />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              {(userEmail?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-900" title={userEmail ?? undefined}>
                {userEmail ?? "Non connecté"}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <span>{role ? ROLE_LABELS[role] ?? role : "…"}</span>
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sync
                </span>
              </p>
            </div>
            <button
              onClick={async () => { await authClient().auth.signOut(); window.location.href = "/login" }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              title="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
