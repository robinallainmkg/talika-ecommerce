"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"

const BARE_PREFIXES = ["/login", "/auth"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))

  if (bare) {
    return <main className="min-h-screen bg-zinc-50">{children}</main>
  }
  return (
    <>
      <Sidebar />
      <main className="min-h-screen bg-zinc-50 lg:ml-64">{children}</main>
    </>
  )
}
