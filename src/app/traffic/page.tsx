"use client"

import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Globe, AlertTriangle, ExternalLink } from "lucide-react"

export default function TrafficPage() {
  return (
    <div>
      <Header
        title="Analyse du Traffic"
        subtitle="Sources, comportement et tendances"
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Warning banner */}
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 sm:p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">
            Données de trafic non connectées
          </h2>
          <p className="text-sm text-zinc-600 max-w-lg mx-auto mb-4">
            Cette page nécessite une connexion à Google Analytics 4 (GA4) ou au
            tracking Shopify pour afficher des données réelles. Aucune donnée
            fictive n&apos;est affichée pour éviter toute confusion.
          </p>
          <Badge variant="warning" className="text-sm px-3 py-1">
            En attente de connexion GA4
          </Badge>
        </div>

        {/* What will be available */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-zinc-400" />
              <CardTitle>Métriques disponibles après connexion</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { title: "Sessions & Visiteurs", desc: "Volume de trafic journalier et tendances" },
                { title: "Sources de trafic", desc: "Organic, Paid, Direct, Social, Email, Referral" },
                { title: "Taux de rebond", desc: "Pourcentage de visiteurs quittant immédiatement" },
                { title: "Durée moyenne de session", desc: "Temps passé sur le site" },
                { title: "Pages vues par session", desc: "Engagement des visiteurs" },
                { title: "Conversions par source", desc: "Taux de conversion par canal d'acquisition" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="text-sm font-medium text-zinc-700">{item.title}</div>
                  <div className="text-xs text-zinc-500 mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How to connect */}
        <Card>
          <CardHeader>
            <CardTitle>Comment connecter GA4</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-600">
              <li>Configurer un compte Google Analytics 4 pour talika.com</li>
              <li>Obtenir les credentials API (OAuth2 ou Service Account)</li>
              <li>Ajouter les clés dans les variables d&apos;environnement Vercel</li>
              <li>Implémenter le sync GA4 → Supabase (comme Meta Ads et Klaviyo)</li>
            </ol>
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Accéder à Google Analytics
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
