"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Globe,
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
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Traffic", href: "/traffic", icon: Globe },
  { name: "Ventes", href: "/sales", icon: ShoppingCart },
  { name: "Meta Ads", href: "/ads", icon: Megaphone },
  { name: "Klaviyo", href: "/klaviyo", icon: Mail },
  { name: "Calendrier", href: "/calendar", icon: Calendar },
  { name: "Projets", href: "/projects", icon: FolderKanban },
  { name: "Influenceurs", href: "/influencers", icon: Users },
  { name: "P&L", href: "/pnl", icon: FileSpreadsheet },
  { name: "Agents", href: "/agents", icon: Bot },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6">
        <Sparkles className="h-6 w-6 text-zinc-900" />
        <span className="text-lg font-bold text-zinc-900">Talika Admin</span>
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
  )
}
