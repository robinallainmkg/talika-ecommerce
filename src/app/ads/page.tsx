"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { PageInsightsPanel } from "@/components/agents/page-insights-panel"
import {
  Megaphone,
  MousePointer,
  DollarSign,
  Target,
  Loader2,
  RefreshCw,
  TrendingUp,
  ShoppingCart,
  Eye,
  Link2,
  Sparkles,
  Check,
  AlertCircle,
} from "lucide-react"

interface Campaign {
  campaign_id: string
  campaign_name: string
  spend: number
  impressions: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  purchases: number
  roas: number
}

interface Adset {
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  spend: number
  impressions: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  purchases: number
  roas: number
}

interface Ad {
  ad_id: string
  ad_name: string
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  spend: number
  impressions: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  purchases: number
  roas: number
}

interface MonthlySummary {
  spend: number
  impressions: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  purchases: number
  roas: number
}

interface MonthlyTrend {
  month: string
  spend: number
  roas: number
  purchases: number
}

const MONTHS_FR: Record<string, string> = {
  "01": "Janv.",
  "02": "Fev.",
  "03": "Mars",
  "04": "Avr.",
  "05": "Mai",
  "06": "Juin",
  "07": "Juil.",
  "08": "Aout",
  "09": "Sept.",
  "10": "Oct.",
  "11": "Nov.",
  "12": "Dec.",
}

function formatMonthLabel(monthStr: string): string {
  const parts = monthStr.split("-")
  if (parts.length === 2) {
    return `${MONTHS_FR[parts[1]] || parts[1]} ${parts[0]}`
  }
  return monthStr
}

export default function MetaAdsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [adsets, setAdsets] = useState<Adset[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [trend, setTrend] = useState<MonthlyTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mappingData, setMappingData] = useState<{
    mapped: any[]
    unmapped: any[]
    autoMappable: any[]
    total_ads: number
  } | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [manualProduct, setManualProduct] = useState<Record<string, string>>({})

  const fetchMappings = useCallback(async () => {
    setMappingLoading(true)
    try {
      const res = await fetch("/api/meta/ad-mappings")
      const json = await res.json()
      setMappingData(json)
    } catch (err) {
      console.error("Failed to fetch mappings:", err)
    } finally {
      setMappingLoading(false)
    }
  }, [])

  async function handleAutoApply() {
    const res = await fetch("/api/meta/ad-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_apply" }),
    })
    const json = await res.json()
    if (json.success) {
      await fetchMappings()
    }
  }

  async function handleManualMap(adId: string, adName: string, productTitle: string) {
    if (!productTitle.trim()) return
    const res = await fetch("/api/meta/ad-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_id: adId, ad_name: adName, product_title: productTitle.trim() }),
    })
    const json = await res.json()
    if (json.success) {
      setManualProduct((prev) => ({ ...prev, [adId]: "" }))
      await fetchMappings()
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/meta")
      const json = await res.json()

      if (json.campaigns?.campaigns) {
        setCampaigns(json.campaigns.campaigns)
      }
      if (json.adsets?.adsets) {
        setAdsets(json.adsets.adsets)
      }
      if (json.ads?.ads) {
        setAds(json.ads.ads)
      }
      if (json.monthly?.summary) {
        setSummary(json.monthly.summary)
      }
      if (json.monthly?.trend) {
        setTrend(json.monthly.trend)
      }
      if (json.monthly?.fetched_at) {
        setLastSync(json.monthly.fetched_at)
      } else if (json.campaigns?.fetched_at) {
        setLastSync(json.campaigns.fetched_at)
      }
    } catch (err) {
      console.error("Failed to fetch Meta data:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch("/api/meta/sync", { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setSyncError(json.error || "Erreur lors de la synchronisation")
      } else {
        await fetchData()
      }
    } catch (err) {
      setSyncError("Erreur reseau lors de la synchronisation")
      console.error("Meta sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }

  // Sort adsets, ads and campaigns by spend descending
  const sortedAdsets = [...adsets].sort((a, b) => b.spend - a.spend)
  const sortedAds = [...ads].sort((a, b) => b.spend - a.spend)
  const sortedCampaigns = [...campaigns].sort((a, b) => b.spend - a.spend)

  return (
    <div>
      <Header
        title="Meta Ads"
        subtitle="Performance des campagnes publicitaires Meta"
      />

      <div className="p-6 space-y-6">
        {/* AI Insights Panel */}
        <PageInsightsPanel
          agentId="meta_ads"
          pageContext="ads"
          title="Insights Meta Ads"
        />

        {/* Sync error */}
        {syncError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {syncError}
          </div>
        )}

        {/* KPI Cards */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KPICard
              label="Depenses"
              value={formatCurrency(summary.spend)}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <KPICard
              label="ROAS"
              value={`${summary.roas.toFixed(2)}x`}
              icon={<Target className="h-5 w-5" />}
            />
            <KPICard
              label="Achats"
              value={formatNumber(summary.purchases)}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <KPICard
              label="CPC"
              value={formatCurrency(summary.cpc)}
              icon={<MousePointer className="h-5 w-5" />}
            />
            <KPICard
              label="CTR"
              value={`${summary.ctr.toFixed(2)}%`}
              icon={<Megaphone className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
            <p className="text-sm text-zinc-500">
              Aucune donnee Meta en cache.{" "}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
              >
                Lancer une synchronisation
              </button>{" "}
              pour afficher les KPIs.
            </p>
          </div>
        )}

        {/* Ad Groups (Adsets) Breakdown Table */}
        {!loading && sortedAdsets.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Ad Groups (Ensembles de pub)
                </CardTitle>
                <Badge variant="info">{sortedAdsets.length} ad groups</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px]">
                        Ad Group
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[150px]">
                        Campagne
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[100px]">
                        Dépenses
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">
                        ROAS
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">
                        Achats
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[100px]">
                        Impressions
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">
                        Clics
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">
                        CPC
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">
                        CTR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdsets.map((adset) => (
                      <tr
                        key={adset.adset_id}
                        className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                      >
                        <td className="py-3">
                          <div className="font-medium text-zinc-900 truncate max-w-[250px]">
                            {adset.adset_name}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="text-xs text-zinc-500 truncate max-w-[150px]">
                            {adset.campaign_name}
                          </div>
                        </td>
                        <td className="py-3 text-right text-zinc-700">
                          {formatCurrency(adset.spend)}
                        </td>
                        <td className="py-3 text-right">
                          <Badge
                            variant={
                              adset.roas >= 3
                                ? "success"
                                : adset.roas >= 2
                                ? "warning"
                                : adset.roas > 0
                                ? "danger"
                                : "default"
                            }
                          >
                            {adset.roas.toFixed(2)}x
                          </Badge>
                        </td>
                        <td className="py-3 text-right text-zinc-700">
                          {formatNumber(adset.purchases)}
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {formatNumber(adset.impressions)}
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {formatNumber(adset.clicks)}
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {formatCurrency(adset.cpc)}
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {adset.ctr.toFixed(2)}%
                        </td>
                      </tr>
                    ))}

                    {/* Totals row */}
                    {sortedAdsets.length > 1 && summary && (
                      <tr className="border-t-2 border-zinc-300 bg-zinc-900 text-white">
                        <td className="py-3 px-1 font-bold" colSpan={2}>TOTAL</td>
                        <td className="py-3 text-right font-bold">
                          {formatCurrency(summary.spend)}
                        </td>
                        <td className="py-3 text-right font-bold">
                          {summary.roas.toFixed(2)}x
                        </td>
                        <td className="py-3 text-right font-bold">
                          {formatNumber(summary.purchases)}
                        </td>
                        <td className="py-3 text-right font-bold">
                          {formatNumber(summary.impressions)}
                        </td>
                        <td className="py-3 text-right font-bold">
                          {formatNumber(summary.clicks)}
                        </td>
                        <td className="py-3 text-right font-bold">
                          {formatCurrency(summary.cpc)}
                        </td>
                        <td className="py-3 text-right font-bold">
                          {summary.ctr.toFixed(2)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Individual Ads (Annonces) Table */}
        {!loading && sortedAds.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Annonces
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{sortedAds.length} annonces</Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setMappingOpen(!mappingOpen)
                      if (!mappingData) fetchMappings()
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                    {mappingOpen ? "Masquer mapping" : "Associer produits"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[180px]">
                        Annonce
                      </th>
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[120px]">
                        Produit
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                        Dépenses
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">
                        ROAS
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">
                        Achats
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                        Impressions
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">
                        Clics
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">
                        CPC
                      </th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">
                        CTR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAds.map((ad) => {
                      const mapping = mappingData?.mapped.find((m) => m.ad_id === ad.ad_id)
                      const autoMap = mappingData?.autoMappable.find((m) => m.ad_id === ad.ad_id)
                      const productLabel = mapping?.product_title || autoMap?.suggested_product || null
                      return (
                        <tr
                          key={ad.ad_id}
                          className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="py-3">
                            <div className="font-medium text-zinc-900 truncate max-w-[220px]">
                              {ad.ad_name}
                            </div>
                          </td>
                          <td className="py-3">
                            {productLabel ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                {productLabel}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400 italic">non associé</span>
                            )}
                          </td>
                          <td className="py-3 text-right text-zinc-700">
                            {formatCurrency(ad.spend)}
                          </td>
                          <td className="py-3 text-right">
                            <Badge
                              variant={
                                ad.roas >= 3
                                  ? "success"
                                  : ad.roas >= 2
                                  ? "warning"
                                  : ad.roas > 0
                                  ? "danger"
                                  : "default"
                              }
                            >
                              {ad.roas.toFixed(2)}x
                            </Badge>
                          </td>
                          <td className="py-3 text-right text-zinc-700">
                            {formatNumber(ad.purchases)}
                          </td>
                          <td className="py-3 text-right text-zinc-600">
                            {formatNumber(ad.impressions)}
                          </td>
                          <td className="py-3 text-right text-zinc-600">
                            {formatNumber(ad.clicks)}
                          </td>
                          <td className="py-3 text-right text-zinc-600">
                            {formatCurrency(ad.cpc)}
                          </td>
                          <td className="py-3 text-right text-zinc-600">
                            {ad.ctr.toFixed(2)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mapping Admin Panel */}
        {mappingOpen && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Association Annonces → Produits
                </CardTitle>
                <Button variant="primary" size="sm" onClick={handleAutoApply}>
                  <Sparkles className="h-4 w-4" />
                  Auto-associer
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {mappingLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : mappingData ? (
                <div className="space-y-6">
                  {/* Already mapped */}
                  {mappingData.mapped.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-500" />
                        Associées ({mappingData.mapped.length})
                      </h4>
                      <div className="space-y-1">
                        {mappingData.mapped.map((m: any) => (
                          <div key={m.ad_id} className="flex items-center justify-between py-1.5 px-3 rounded bg-emerald-50 border border-emerald-100">
                            <span className="text-sm text-zinc-700">{m.ad_name}</span>
                            <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              {m.product_title}
                              {m.source === "auto" && " (auto)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Auto-matchable */}
                  {mappingData.autoMappable.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        Auto-détectées ({mappingData.autoMappable.length}) — cliquez &quot;Auto-associer&quot; pour valider
                      </h4>
                      <div className="space-y-1">
                        {mappingData.autoMappable.map((m: any) => (
                          <div key={m.ad_id} className="flex items-center justify-between py-1.5 px-3 rounded bg-amber-50 border border-amber-100">
                            <span className="text-sm text-zinc-700">{m.ad_name}</span>
                            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              → {m.suggested_product}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unmapped — manual input */}
                  {mappingData.unmapped.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Non associées ({mappingData.unmapped.length}) — saisir le produit manuellement
                      </h4>
                      <div className="space-y-2">
                        {mappingData.unmapped.map((m: any) => (
                          <div key={m.ad_id} className="flex items-center gap-3 py-1.5 px-3 rounded bg-red-50 border border-red-100">
                            <span className="text-sm text-zinc-700 min-w-[200px]">{m.ad_name}</span>
                            <input
                              type="text"
                              placeholder="Nom du produit..."
                              value={manualProduct[m.ad_id] || ""}
                              onChange={(e) =>
                                setManualProduct((prev) => ({ ...prev, [m.ad_id]: e.target.value }))
                              }
                              className="flex-1 text-sm rounded border border-zinc-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-500"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleManualMap(m.ad_id, m.ad_name, manualProduct[m.ad_id] || "")
                                }
                              }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleManualMap(m.ad_id, m.ad_name, manualProduct[m.ad_id] || "")}
                              disabled={!manualProduct[m.ad_id]?.trim()}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {mappingData.mapped.length === mappingData.total_ads && (
                    <div className="text-center py-4 text-sm text-emerald-600 font-medium">
                      Toutes les annonces sont associées à un produit !
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Fallback: show campaigns if no adsets yet */}
        {!loading && sortedAdsets.length === 0 && sortedCampaigns.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Campagnes
                </CardTitle>
                <Badge variant="info">{sortedCampaigns.length} campagnes</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[200px]">Campagne</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Dépenses</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">ROAS</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Achats</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Impressions</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Clics</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">CPC</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCampaigns.map((c) => (
                      <tr key={c.campaign_id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                        <td className="py-3 font-medium text-zinc-900 truncate max-w-[300px]">{c.campaign_name}</td>
                        <td className="py-3 text-right text-zinc-700">{formatCurrency(c.spend)}</td>
                        <td className="py-3 text-right">
                          <Badge variant={c.roas >= 3 ? "success" : c.roas >= 2 ? "warning" : c.roas > 0 ? "danger" : "default"}>
                            {c.roas.toFixed(2)}x
                          </Badge>
                        </td>
                        <td className="py-3 text-right text-zinc-700">{formatNumber(c.purchases)}</td>
                        <td className="py-3 text-right text-zinc-600">{formatNumber(c.impressions)}</td>
                        <td className="py-3 text-right text-zinc-600">{formatNumber(c.clicks)}</td>
                        <td className="py-3 text-right text-zinc-600">{formatCurrency(c.cpc)}</td>
                        <td className="py-3 text-right text-zinc-600">{c.ctr.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend (last 6 months) */}
        {!loading && trend.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Tendance mensuelle (6 derniers mois)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Visual bar chart */}
              <div className="mb-6">
                <div className="flex items-end gap-3 h-40">
                  {trend.map((m) => {
                    const maxSpend = Math.max(...trend.map((t) => t.spend), 1)
                    const heightPct = (m.spend / maxSpend) * 100
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-zinc-500 font-medium">
                          {formatCurrency(m.spend)}
                        </span>
                        <div className="w-full flex flex-col items-center">
                          <div
                            className="w-full max-w-[60px] rounded-t-md bg-zinc-900 transition-all duration-500"
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                          />
                        </div>
                        <div className="text-center">
                          <span className="text-xs text-zinc-500 block">
                            {formatMonthLabel(m.month)}
                          </span>
                          <span className="text-xs font-medium text-zinc-700">
                            {m.roas.toFixed(1)}x
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400">
                  <div className="flex items-center gap-1">
                    <div className="h-2.5 w-2.5 rounded-sm bg-zinc-900" />
                    Depenses
                  </div>
                  <div className="flex items-center gap-1">
                    Valeur sous barre = ROAS
                  </div>
                </div>
              </div>

              {/* Detail table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="pb-2 text-left font-medium text-zinc-500">Mois</th>
                      <th className="pb-2 text-right font-medium text-zinc-500">Depenses</th>
                      <th className="pb-2 text-right font-medium text-zinc-500">ROAS</th>
                      <th className="pb-2 text-right font-medium text-zinc-500">Achats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((m) => (
                      <tr key={m.month} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                        <td className="py-2 font-medium text-zinc-700">
                          {formatMonthLabel(m.month)}
                        </td>
                        <td className="py-2 text-right text-zinc-600">
                          {formatCurrency(m.spend)}
                        </td>
                        <td className="py-2 text-right">
                          <Badge
                            variant={
                              m.roas >= 3 ? "success" : m.roas >= 2 ? "warning" : m.roas > 0 ? "danger" : "default"
                            }
                          >
                            {m.roas.toFixed(2)}x
                          </Badge>
                        </td>
                        <td className="py-2 text-right text-zinc-600">
                          {formatNumber(m.purchases)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!loading && campaigns.length === 0 && !summary && (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Eye className="h-10 w-10 text-zinc-300 mb-3" />
                <h3 className="text-lg font-medium text-zinc-700 mb-1">
                  Aucune donnee Meta Ads
                </h3>
                <p className="text-sm text-zinc-500 mb-4 max-w-md">
                  Cliquez sur &quot;Sync Meta&quot; pour recuperer les donnees de vos campagnes
                  depuis l&apos;API Meta Graph.
                </p>
                <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Synchronisation...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Synchroniser maintenant
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
