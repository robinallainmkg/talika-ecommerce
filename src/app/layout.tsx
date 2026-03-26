import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/layout/sidebar"

export const metadata: Metadata = {
  title: "Talika Admin - Plateforme de Gestion",
  description: "Plateforme de gestion intelligente de l'activité Talika",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body className="antialiased font-sans">
        <Sidebar />
        <main className="min-h-screen bg-zinc-50 lg:ml-64">
          {children}
        </main>
      </body>
    </html>
  )
}
