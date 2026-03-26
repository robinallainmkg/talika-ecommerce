"use client"

import { Bell, Search, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex min-h-[4rem] items-center justify-between gap-2 border-b border-zinc-200 bg-white/80 px-4 sm:px-6 backdrop-blur-sm py-2">
      <div className="pl-12 lg:pl-0 min-w-0 flex-1">
        <h1 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-zinc-500 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {actions}
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
