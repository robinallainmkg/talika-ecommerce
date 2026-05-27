"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
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
  Package,
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
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mappingData, setMappingData] = useState<{
    mapped: any[]
    unmapped: any[]
    autoMappable: any[]
    total_ads: number
  } | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [manualProduct, setManualProduct] = useState<Record<string, string>>({})

  // Product performance aggregation
  interface ProductPerf {
    name: string
    spend: number
    purchases: number
    roas: number
    cpa: number
    impressions: number
    clicks: number
    ctr: number
    budgetShare: number
    adCount: number
  }
  const [productPerf, setProductPerf] = useState<ProductPerf[]>([])

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
      const [metaRes, mapRes] = await Promise.all([
        fetch("/api/meta"),
        fetch("/api/meta/ad-mappings"),
      ])
      const json = await metaRes.json()
      const mapJson = await mapRes.json()

      const adsData: Ad[] = json.ads?.ads || []
      const summaryData: MonthlySummary | null = json.monthly?.summary || null

      if (json.campaigns?.campaigns) {
        setCampaigns(json.campaigns.campaigns)
      }
      if (json.adsets?.adsets) {
        setAdsets(json.adsets.adsets)
      }
      setAds(adsData)
      if (summaryData) {
        setSummary(summaryData)
      }
      if (json.monthly?.trend) {
        setTrend(json.monthly.trend)
      }
      setMappingData(mapJson)

      // ── Compute product-level performance ──
      if (adsData.length > 0 && summaryData) {
        const mappedAds = new Map<string, string>()
        for (const m of [...(mapJson.mapped || []), ...(mapJson.autoMappable || [])]) {
          mappedAds.set(m.ad_id, m.product_title || m.suggested_product || "")
        }

        const perfMap: Record<string, { spend: number; purchases: number; revenue: number; impressions: number; clicks: number; adCount: number }> = {}
        const totalAdSpend = adsData.reduce((s: number, a: Ad) => s + a.spend, 0)

        for (const ad of adsData) {
          const product = mappedAds.get(ad.ad_id) || "Non associé"
          if (!perfMap[product]) {
            perfMap[product] = { spend: 0, purchases: 0, revenue: 0, impressions: 0, clicks: 0, adCount: 0 }
          }
          perfMap[product].spend += ad.spend
          perfMap[product].purchases += ad.purchases
          perfMap[product].revenue += ad.spend * ad.roas
          perfMap[product].impressions += ad.impressions
          perfMap[product].clicks += ad.clicks
          perfMap[product].adCount += 1
        }

        const perfList: ProductPerf[] = Object.entries(perfMap)
          .map(([name, data]) => ({
            name,
            spend: data.spend,
            purchases: data.purchases,
            roas: data.spend > 0 ? data.revenue / data.spend : 0,
            cpa: data.purchases > 0 ? data.spend / data.purchases : 0,
            impressions: data.impressions,
            clicks: data.clicks,
            ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
            budgetShare: totalAdSpend > 0 ? (data.spend / totalAdSpend) * 100 : 0,
            adCount: data.adCount,
          }))
          .sort((a, b) => b.spend - a.spend)

        setProductPerf(perfList)
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

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <DataInsights page="ads" />

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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
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

        {/* Product Performance Card */}
        {!loading && productPerf.length > 0 && productPerf.some((p) => p.name !== "Non associé") && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-violet-500" />
                  Performance par produit
                </CardTitle>
                <Badge variant="info">
                  {productPerf.filter((p) => p.name !== "Non associé").length} produits
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Visual budget allocation bar */}
              <div className="mb-4">
                <p className="text-xs font-medium text-zinc-500 mb-2">Répartition du budget</p>
                <div className="flex rounded-lg overflow-hidden h-6 bg-zinc-100">
                  {productPerf.filter((p) => p.name !== "Non associé" && p.budgetShare > 2).map((p, i) => {
                    const colors = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500"]
                    return (
                      <div
                        key={p.name}
                        className={`${colors[i % colors.length]} flex items-center justify-center text-[10px] font-medium text-white transition-all`}
                        style={{ width: `${Math.max(p.budgetShare, 3)}%` }}
                        title={`${p.name}: ${Math.round(p.budgetShare)}%`}
                      >
                        {p.budgetShare > 10 ? `${p.name.substring(0, 12)} ${Math.round(p.budgetShare)}%` : ""}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-zinc-300">
                      <th className="pb-3 text-left font-medium text-zinc-500 min-w-[160px]">Produit</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">Budget</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[60px]">% Budget</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">ROAS</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">Achats</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[80px]">CPA</th>
                      <th className="pb-3 text-right font-medium text-zinc-500 min-w-[70px]">CTR</th>
                      <th className="pb-3 text-center font-medium text-zinc-500 min-w-[60px]">Annonces</th>
                      <th className="pb-3 text-center font-medium text-zinc-500 min-w-[80px]">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPerf.map((p) => {
                      const verdict = p.name === "Non associé"
                        ? { label: "—", variant: "default" as const }
                        : p.roas >= 5
                        ? { label: "Scaler", variant: "success" as const }
                        : p.roas >= 3
                        ? { label: "Maintenir", variant: "info" as const }
                        : p.roas >= 2
                        ? { label: "Optimiser", variant: "warning" as const }
                        : p.purchases === 0
                        ? { label: "Couper", variant: "danger" as const }
                        : { label: "Tester", variant: "danger" as const }
                      return (
                        <tr key={p.name} className={`border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors ${p.name === "Non associé" ? "opacity-50" : ""}`}>
                          <td className="py-2.5">
                            <span className="font-medium text-zinc-900">{p.name}</span>
                          </td>
                          <td className="py-2.5 text-right text-zinc-700">{formatCurrency(p.spend)}</td>
                          <td className="py-2.5 text-right text-zinc-500">{Math.round(p.budgetShare)}%</td>
                          <td className="py-2.5 text-right">
                            <Badge variant={p.roas >= 5 ? "success" : p.roas >= 3 ? "info" : p.roas >= 2 ? "warning" : p.roas > 0 ? "danger" : "default"}>
                              {p.roas.toFixed(1)}x
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right text-zinc-700">{p.purchases}</td>
                          <td className="py-2.5 text-right text-zinc-600">
                            {p.cpa > 0 ? formatCurrency(p.cpa) : "—"}
                          </td>
                          <td className="py-2.5 text-right text-zinc-600">{p.ctr.toFixed(2)}%</td>
                          <td className="py-2.5 text-center text-zinc-500">{p.adCount}</td>
                          <td className="py-2.5 text-center">
                            <Badge variant={verdict.variant}>{verdict.label}</Badge>
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
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
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
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
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
                          <div key={m.ad_id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 py-1.5 px-3 rounded bg-red-50 border border-red-100">
                            <span className="text-sm text-zinc-700 sm:min-w-[200px] truncate max-w-full">{m.ad_name}</span>
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
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
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
                <div className="flex items-end gap-2 sm:gap-3 h-32 sm:h-40">
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
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
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
