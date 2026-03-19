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
        <main className="ml-64 min-h-screen bg-zinc-50">
          {children}
        </main>
      </body>
    </html>
  )
}
