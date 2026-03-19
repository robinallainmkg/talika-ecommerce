"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"
import { formatCurrency, formatNumber } from "@/lib/utils"
import {
  Users,
  DollarSign,
  ShoppingCart,
  Upload,
  Plus,
  X,
  Instagram,
  FileText,
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  Tag,
  TrendingUp,
} from "lucide-react"

interface DiscountCode {
  id: string
  code: string
  discount_percent?: number
  discount_amount?: number
  is_active: boolean
  influencer_id: string | null
  created_at?: string
}

interface InfluencerSale {
  id: string
  revenue: number
  order_id?: string
  created_at?: string
  discount_code_id?: string
}

interface InfluencerRow {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  instagram?: string | null
  tiktok?: string | null
  tier: string
  commission_rate?: number | null
  status: string
  notes?: string | null
  created_at?: string
  discount_codes: DiscountCode[]
  influencer_sales: InfluencerSale[]
}

const tierColors: Record<string, "default" | "info" | "warning" | "success"> = {
  micro: "default",
  mid: "info",
  macro: "warning",
  mega: "success",
}

const tierLabels: Record<string, string> = {
  micro: "Micro",
  mid: "Mid",
  macro: "Macro",
  mega: "Mega",
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerRow[]>([])
  const [nonInfluencerCodes, setNonInfluencerCodes] = useState<DiscountCode[]>([])
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const [influencersRes, codesRes] = await Promise.all([
          supabase
            .from("influencers")
            .select(`*, discount_codes (*), influencer_sales (*)`)
            .order("name"),
          supabase
            .from("discount_codes")
            .select("*")
            .is("influencer_id", null),
        ])

        if (influencersRes.error) throw influencersRes.error
        if (codesRes.error) throw codesRes.error

        setInfluencers(influencersRes.data ?? [])
        setNonInfluencerCodes(codesRes.data ?? [])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erreur lors du chargement des données"
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // KPI calculations
  const activeCount = influencers.filter((i) => i.status === "active").length
  const totalRevenue = influencers.reduce(
    (sum, i) => sum + i.influencer_sales.reduce((s, sale) => s + (sale.revenue || 0), 0),
    0
  )
  const totalSales = influencers.reduce((sum, i) => sum + i.influencer_sales.length, 0)
  const totalInfluencers = influencers.length

  // Helpers for a single influencer
  function getInfluencerRevenue(inf: InfluencerRow): number {
    return inf.influencer_sales.reduce((s, sale) => s + (sale.revenue || 0), 0)
  }

  function getActiveCodes(inf: InfluencerRow): DiscountCode[] {
    return inf.discount_codes.filter((c) => c.is_active)
  }

  if (loading) {
    return (
      <div>
        <Header
          title="Gestion Influenceurs"
          subtitle="Tracking, facturation et performance des influenceurs"
        />
        <div className="flex items-center justify-center p-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          <span className="ml-3 text-zinc-500">Chargement…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <Header
          title="Gestion Influenceurs"
          subtitle="Tracking, facturation et performance des influenceurs"
        />
        <div className="flex items-center justify-center p-20 text-red-600">
          <AlertCircle className="h-6 w-6 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

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
            label="Influenceurs Actifs"
            value={activeCount}
            icon={<Users className="h-5 w-5" />}
          />
          <KPICard
            label="CA Généré"
            value={formatCurrency(totalRevenue)}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <KPICard
            label="Ventes Totales"
            value={formatNumber(totalSales)}
            icon={<ShoppingCart className="h-5 w-5" />}
          />
          <KPICard
            label="Total Influenceurs"
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
                    <th className="pb-3 text-left font-medium text-zinc-500">Instagram</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">TikTok</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Tier</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Commission %</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Codes actifs</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Ventes</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {influencers.map((influencer) => (
                    <tr
                      key={influencer.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                      onClick={() => setSelectedInfluencer(influencer)}
                    >
                      <td className="py-3">
                        <div className="font-medium text-zinc-900">{influencer.name}</div>
                        {influencer.email && (
                          <div className="text-xs text-zinc-400">{influencer.email}</div>
                        )}
                      </td>
                      <td className="py-3 text-zinc-600">
                        {influencer.instagram || "—"}
                      </td>
                      <td className="py-3 text-zinc-600">
                        {influencer.tiktok || "—"}
                      </td>
                      <td className="py-3">
                        <Badge variant={tierColors[influencer.tier] ?? "default"}>
                          {tierLabels[influencer.tier] ?? influencer.tier}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-zinc-600">
                        {influencer.commission_rate != null
                          ? `${influencer.commission_rate}%`
                          : "—"}
                      </td>
                      <td className="py-3 text-right text-zinc-600">
                        {getActiveCodes(influencer).length}
                      </td>
                      <td className="py-3 text-right text-zinc-600">
                        {influencer.influencer_sales.length}
                      </td>
                      <td className="py-3 text-right text-zinc-600">
                        {formatCurrency(getInfluencerRevenue(influencer))}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={influencer.status === "active" ? "success" : "default"}
                        >
                          {influencer.status === "active" ? "Actif" : "Inactif"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {influencers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-zinc-400">
                        Aucun influenceur trouvé
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Non-influencer discount codes */}
        <Card>
          <CardHeader>
            <CardTitle>Codes non-influenceurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500 mb-3">
              Ces codes de réduction ne sont pas liés à des influenceurs (welcome, SAV, etc.)
            </p>
            <div className="flex flex-wrap gap-2">
              {nonInfluencerCodes.length > 0 ? (
                nonInfluencerCodes.map((code) => (
                  <Badge key={code.id} variant="default">
                    {code.code}
                    {code.discount_percent != null && ` (-${code.discount_percent}%)`}
                    {code.discount_amount != null && ` (-${formatCurrency(code.discount_amount)})`}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-zinc-400">Aucun code trouvé</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Influencer Detail Drawer */}
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
              {/* Contact info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase">Contact</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700">
                      {selectedInfluencer.email || "Non renseigné"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700">
                      {selectedInfluencer.phone || "Non renseigné"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-700">
                      {selectedInfluencer.instagram || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.3z" />
                    </svg>
                    <span className="text-zinc-700">
                      {selectedInfluencer.tiktok || "—"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                  <div>
                    <span className="text-zinc-500">Tier</span>
                    <div className="mt-1">
                      <Badge variant={tierColors[selectedInfluencer.tier] ?? "default"}>
                        {tierLabels[selectedInfluencer.tier] ?? selectedInfluencer.tier}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Commission</span>
                    <div className="font-medium mt-1">
                      {selectedInfluencer.commission_rate != null
                        ? `${selectedInfluencer.commission_rate}%`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">Statut</span>
                    <div className="mt-1">
                      <Badge
                        variant={selectedInfluencer.status === "active" ? "success" : "default"}
                      >
                        {selectedInfluencer.status === "active" ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount codes */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  Codes de réduction
                </h3>
                {selectedInfluencer.discount_codes.length > 0 ? (
                  <div className="space-y-2">
                    {selectedInfluencer.discount_codes.map((code) => (
                      <div
                        key={code.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant={code.is_active ? "info" : "default"}>
                            {code.code}
                          </Badge>
                          {code.discount_percent != null && (
                            <span className="text-xs text-zinc-500">
                              -{code.discount_percent}%
                            </span>
                          )}
                          {code.discount_amount != null && (
                            <span className="text-xs text-zinc-500">
                              -{formatCurrency(code.discount_amount)}
                            </span>
                          )}
                        </div>
                        <Badge variant={code.is_active ? "success" : "danger"}>
                          {code.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">Aucun code associé</p>
                )}
              </div>

              {/* Sales breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Ventes
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Nombre de ventes</span>
                    <div className="text-xl font-bold text-zinc-900">
                      {selectedInfluencer.influencer_sales.length}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-500">CA généré</span>
                    <div className="text-xl font-bold text-zinc-900">
                      {formatCurrency(getInfluencerRevenue(selectedInfluencer))}
                    </div>
                  </div>
                </div>
                {selectedInfluencer.influencer_sales.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50">
                          <th className="px-3 py-2 text-left font-medium text-zinc-500">Date</th>
                          <th className="px-3 py-2 text-right font-medium text-zinc-500">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInfluencer.influencer_sales
                          .sort(
                            (a, b) =>
                              new Date(b.created_at ?? 0).getTime() -
                              new Date(a.created_at ?? 0).getTime()
                          )
                          .map((sale) => (
                            <tr key={sale.id} className="border-b border-zinc-50">
                              <td className="px-3 py-1.5 text-zinc-600">
                                {sale.created_at
                                  ? new Intl.DateTimeFormat("fr-FR", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    }).format(new Date(sale.created_at))
                                  : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right text-zinc-900 font-medium">
                                {formatCurrency(sale.revenue)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedInfluencer.notes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase">Notes</h3>
                  <p className="text-sm text-zinc-600 whitespace-pre-wrap">
                    {selectedInfluencer.notes}
                  </p>
                </div>
              )}

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
