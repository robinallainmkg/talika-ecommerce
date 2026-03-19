"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockInfluencers } from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/utils"
import type { Influencer } from "@/types"
import {
  Users,
  DollarSign,
  ShoppingCart,
  Upload,
  Plus,
  X,
  Instagram,
  FileText,
} from "lucide-react"

const tierColors: Record<string, "default" | "info" | "warning" | "success"> = {
  micro: "default",
  mid: "info",
  macro: "warning",
  mega: "success",
}

const paymentLabels: Record<string, string> = {
  free: "Gratuit",
  fixed: "Fixe",
  commission: "Commission",
  "fixed+commission": "Fixe + Commission",
}

export default function InfluencersPage() {
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null)

  const totalInfluencers = mockInfluencers.length
  const totalRevenue = mockInfluencers.reduce((s, i) => s + i.totalRevenue, 0)
  const totalSales = mockInfluencers.reduce((s, i) => s + i.totalSales, 0)
  const activeCount = mockInfluencers.filter((i) => i.status === "active").length

  return (
    <div>
      <Header
        title="Gestion Influenceurs"
        subtitle="Tracking, facturation et performance des influenceurs"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <Upload className="h-4 w-4" />
              Importer CSV
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Influenceurs actifs"
            value={activeCount}
            icon={<Users className="h-5 w-5" />}
          />
          <KPICard
            label="CA généré"
            value={formatCurrency(totalRevenue)}
            change={22.5}
            changeLabel="vs mois dernier"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <KPICard
            label="Ventes totales"
            value={formatNumber(totalSales)}
            change={15.3}
            changeLabel="vs mois dernier"
            icon={<ShoppingCart className="h-5 w-5" />}
          />
          <KPICard
            label="Total influenceurs"
            value={totalInfluencers}
            icon={<Instagram className="h-5 w-5" />}
          />
        </div>

        {/* Influencers table */}
        <Card>
          <CardHeader>
            <CardTitle>Liste des influenceurs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Nom</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Plateforme</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Followers</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Tier</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Paiement</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Codes</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Ventes</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Statut</th>
                    <th className="pb-3 text-right font-medium text-zinc-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {mockInfluencers.map((influencer) => (
                    <tr
                      key={influencer.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                      onClick={() => setSelectedInfluencer(influencer)}
                    >
                      <td className="py-3">
                        <div className="font-medium text-zinc-900">{influencer.name}</div>
                        {influencer.instagram && (
                          <div className="text-xs text-zinc-400">{influencer.instagram}</div>
                        )}
                      </td>
                      <td className="py-3 text-zinc-600">{influencer.platform}</td>
                      <td className="py-3 text-right text-zinc-600">
                        {formatNumber(influencer.followers)}
                      </td>
                      <td className="py-3">
                        <Badge variant={tierColors[influencer.tier]}>{influencer.tier}</Badge>
                      </td>
                      <td className="py-3 text-zinc-600">
                        {paymentLabels[influencer.paymentType]}
                      </td>
                      <td className="py-3">
                        {influencer.discountCodes.map((code) => (
                          <Badge key={code} variant="default" className="mr-1">
                            {code}
                          </Badge>
                        ))}
                      </td>
                      <td className="py-3 text-right text-zinc-600">{influencer.totalSales}</td>
                      <td className="py-3 text-right text-zinc-600">
                        {formatCurrency(influencer.totalRevenue)}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={influencer.status === "active" ? "success" : "default"}
                        >
                          {influencer.status === "active" ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Note about non-influencer codes */}
        <Card>
          <CardHeader>
            <CardTitle>Codes non-influenceurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500 mb-3">
              Ces codes de réduction ne sont pas liés à des influenceurs (welcome, SAV, etc.)
            </p>
            <div className="flex gap-2">
              <Badge variant="default">WELCOME10</Badge>
              <Badge variant="default">SAV15</Badge>
              <Badge variant="default">RETOUR20</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Influencer Drawer */}
      {selectedInfluencer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setSelectedInfluencer(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-zinc-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">
                {selectedInfluencer.name}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedInfluencer(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-6">
              {/* Profile info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase">Profil</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Email</span>
                    <div className="font-medium">{selectedInfluencer.email || "—"}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Plateforme</span>
                    <div className="font-medium">{selectedInfluencer.platform}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Instagram</span>
                    <div className="font-medium">{selectedInfluencer.instagram || "—"}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500">TikTok</span>
                    <div className="font-medium">{selectedInfluencer.tiktok || "—"}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Followers</span>
                    <div className="font-medium">
                      {formatNumber(selectedInfluencer.followers)}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Tier</span>
                    <div>
                      <Badge variant={tierColors[selectedInfluencer.tier]}>
                        {selectedInfluencer.tier}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase">
                  Paiement & Facturation
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Type</span>
                    <div className="font-medium">
                      {paymentLabels[selectedInfluencer.paymentType]}
                    </div>
                  </div>
                  {selectedInfluencer.fixedFee && (
                    <div>
                      <span className="text-zinc-500">Montant fixe</span>
                      <div className="font-medium">
                        {formatCurrency(selectedInfluencer.fixedFee)}
                      </div>
                    </div>
                  )}
                  {selectedInfluencer.commissionRate && (
                    <div>
                      <span className="text-zinc-500">Commission</span>
                      <div className="font-medium">
                        {selectedInfluencer.commissionRate}%
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500">RIB</span>
                    <div className="font-medium">{selectedInfluencer.rib || "Non renseigné"}</div>
                  </div>
                </div>
              </div>

              {/* Codes & Performance */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase">
                  Codes & Performance
                </h3>
                <div className="flex gap-2">
                  {selectedInfluencer.discountCodes.map((code) => (
                    <Badge key={code} variant="info">
                      {code}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Ventes totales</span>
                    <div className="font-medium">{selectedInfluencer.totalSales}</div>
                  </div>
                  <div>
                    <span className="text-zinc-500">CA généré</span>
                    <div className="font-medium">
                      {formatCurrency(selectedInfluencer.totalRevenue)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <Button className="w-full" size="sm">
                  <FileText className="h-4 w-4" />
                  Créer une facture
                </Button>
                <Button variant="secondary" className="w-full" size="sm">
                  Voir les ventes détaillées
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
