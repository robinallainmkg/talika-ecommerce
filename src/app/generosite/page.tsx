"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import { Button } from "@/components/ui/button"
import {
  Gift,
  Users,
  Tag,
  Percent,
  Truck,
  Headphones,
  HelpCircle,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────

interface CodeDetail {
  code: string
  discount: number
  count: number
}

interface CategoryData {
  id: string
  label: string
  discount: number
  orders: number
  generosite_pct: number
  excluded?: boolean
  codes: CodeDetail[]
}

interface GenerositeData {
  period: string
  total_orders: number
  orders_with_discount: number
  total_revenue: number
  total_discount_codes: number
  total_prix_barres: number
  total_generosite: number
  generosite_rate: number
  categories: CategoryData[]
  shipping?: {
    orders_paid: number
    orders_free: number
    revenue_collected: number
    estimated_free_cost: number
    avg_shipping_price: number
    free_shipping_rate: number
    methods: { method: string; count: number; revenue: number }[]
  }
}

// ─── Constants ────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, typeof Gift> = {
  gifting: Gift,
  influence: Users,
  welcome: Tag,
  offre_site: Tag,
  auto_discounts: Percent,
  logistique: Truck,
  service_client: Headphones,
  autre: HelpCircle,
}

const CATEGORY_COLORS: Record<string, string> = {
  gifting: "text-purple-600",
  influence: "text-blue-600",
  welcome: "text-emerald-600",
  offre_site: "text-amber-600",
  auto_discounts: "text-cyan-600",
  logistique: "text-red-600",
  service_client: "text-zinc-500",
  autre: "text-zinc-500",
}

const CATEGORY_ORDER = [
  "gifting",
  "influence",
  "welcome",
  "offre_site",
  "auto_discounts",
  "logistique",
  "service_client",
  "autre",
]

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]
const MONTHS_FULL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

// ─── Page ─────────────────────────────────────────────────────────

export default function GenerositePage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [monthlyData, setMonthlyData] = useState<Record<number, GenerositeData>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  // Fetch all months 1..currentMonth in parallel
  const fetchAllMonths = useCallback(async () => {
    setLoading(true)
    try {
      const months = Array.from({ length: currentMonth }, (_, i) => i + 1)
      const results = await Promise.all(
        months.map(async (m) => {
          try {
            const res = await fetch(`/api/generosite?year=${currentYear}&month=${m}`)
            const json = await res.json()
            if (!json.error) return { month: m, data: json as GenerositeData }
          } catch {
            // skip failed months
          }
          return { month: m, data: null }
        })
      )
      const record: Record<number, GenerositeData> = {}
      results.forEach((r) => {
        if (r.data) record[r.month] = r.data
      })
      setMonthlyData(record)
    } catch {
      setMonthlyData({})
    } finally {
      setLoading(false)
    }
  }, [currentYear, currentMonth])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "orders", year: currentYear, month: currentMonth }),
      })
      await fetchAllMonths()
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }, [currentYear, currentMonth, fetchAllMonths])

  useEffect(() => {
    fetchAllMonths()
  }, [fetchAllMonths])

  // Current month data for KPIs
  const currentData = monthlyData[currentMonth] || null

  // Build list of active months (1..currentMonth)
  const activeMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)

  // Build category rows: collect all categories across all months
  const categoryLabels: Record<string, string> = {}
  activeMonths.forEach((m) => {
    const d = monthlyData[m]
    if (!d) return
    d.categories.forEach((cat) => {
      if (!categoryLabels[cat.id]) categoryLabels[cat.id] = cat.label
    })
  })

  // Get discount amount for a category in a given month
  const getCategoryDiscount = (catId: string, month: number): number => {
    const d = monthlyData[month]
    if (!d) return 0
    const cat = d.categories.find((c) => c.id === catId)
    return cat ? cat.discount : 0
  }

  // Get category discount as % of revenue for that month
  const getCategoryPct = (catId: string, month: number): number => {
    const d = monthlyData[month]
    if (!d || d.total_revenue === 0) return 0
    const cat = d.categories.find((c) => c.id === catId)
    if (!cat) return 0
    return Math.round((cat.discount / d.total_revenue) * 1000) / 10
  }

  // Get month revenue
  const getMonthRevenue = (month: number): number => {
    const d = monthlyData[month]
    return d ? d.total_revenue : 0
  }

  // Get codes detail for a category in a selected month
  const getCodesForCategory = (catId: string): CodeDetail[] => {
    const d = monthlyData[currentMonth]
    if (!d) return []
    const cat = d.categories.find(c => c.id === catId)
    return cat?.codes || []
  }

  // Filter categories: only show those with at least one non-zero month
  const visibleCategories = CATEGORY_ORDER.filter((catId) => {
    if (!categoryLabels[catId]) return false
    return activeMonths.some((m) => getCategoryDiscount(catId, m) > 0)
  })

  // Also include any categories not in CATEGORY_ORDER
  Object.keys(categoryLabels).forEach((catId) => {
    if (!visibleCategories.includes(catId)) {
      const hasData = activeMonths.some((m) => getCategoryDiscount(catId, m) > 0)
      if (hasData) visibleCategories.push(catId)
    }
  })

  // Total discount per month
  const getMonthTotal = (month: number): number => {
    const d = monthlyData[month]
    return d ? d.total_generosite : 0
  }

  // Generosite rate per month
  const getMonthRate = (month: number): number => {
    const d = monthlyData[month]
    return d ? d.generosite_rate : 0
  }

  return (
    <div>
      <Header
        title="Générosité"
        subtitle={`${currentYear} — Vue mensuelle par catégorie de générosité`}
        actions={
          <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Sync..." : "Sync Shopify"}
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <DataInsights page="generosite" />

        {loading ? (
          <div className="text-center py-12 text-zinc-400">Chargement...</div>
        ) : Object.keys(monthlyData).length === 0 ? (
          <div className="text-center py-12 text-zinc-400">Aucune donnée. Lancez une sync Shopify.</div>
        ) : (
          <>
            {/* KPIs — current month */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard
                label="Taux de Générosité"
                value={currentData ? `${currentData.generosite_rate}%` : "—"}
                icon={<Percent className="h-5 w-5" />}
                changeLabel={`${MONTHS_FULL[currentMonth - 1]} ${currentYear}`}
              />
              <KPICard
                label="Total Discounts"
                value={currentData ? formatCurrency(currentData.total_generosite) : "—"}
                icon={<Tag className="h-5 w-5" />}
              />
              <KPICard
                label={`CA ${MONTHS_FULL[currentMonth - 1]}`}
                value={currentData ? formatCurrency(currentData.total_revenue) : "—"}
                icon={<Gift className="h-5 w-5" />}
              />
            </div>

            {/* Monthly table */}
            <Card>
              <CardHeader>
                <CardTitle>Générosité par catégorie — {currentYear}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="pb-2 pr-4 text-left font-medium text-zinc-500 min-w-[160px]">Catégorie</th>
                        {activeMonths.map((m) => (
                          <th
                            key={m}
                            className={`pb-2 text-right font-medium text-zinc-500 min-w-[90px] ${
                              m === currentMonth ? "bg-zinc-50 rounded-t" : ""
                            }`}
                          >
                            {MONTH_LABELS[m - 1]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCategories.map((catId) => {
                        const Icon = CATEGORY_ICONS[catId] || HelpCircle
                        const colorClass = CATEGORY_COLORS[catId] || "text-zinc-500"
                        const isExpanded = expandedCats.has(catId)
                        const codes = getCodesForCategory(catId)
                        return (
                          <>
                          <tr key={catId} className="border-b border-zinc-50 hover:bg-zinc-50/50 cursor-pointer" onClick={() => toggleCat(catId)}>
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                {codes.length > 0 ? (
                                  isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                                ) : (
                                  <Icon className={`h-4 w-4 ${colorClass}`} />
                                )}
                                <Icon className={`h-4 w-4 ${colorClass}`} />
                                <span className="text-zinc-700">{categoryLabels[catId]}</span>
                              </div>
                            </td>
                            {activeMonths.map((m) => {
                              const pct = getCategoryPct(catId, m)
                              const prevPct = m > 1 ? getCategoryPct(catId, m - 1) : 0
                              const hasPrev = m > 1 && prevPct > 0
                              const delta = hasPrev ? pct - prevPct : 0
                              const trendColor = !hasPrev || pct === 0
                                ? "text-zinc-500"
                                : delta > 0.3
                                  ? "text-red-600"
                                  : delta < -0.3
                                    ? "text-emerald-600"
                                    : "text-zinc-600"
                              return (
                                <td
                                  key={m}
                                  className={`py-2.5 text-right ${trendColor} ${
                                    m === currentMonth ? "bg-zinc-50" : ""
                                  }`}
                                  title={pct > 0 ? `${formatCurrency(getCategoryDiscount(catId, m))}${hasPrev ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)}pts)` : ""}` : ""}
                                >
                                  {pct > 0 ? (
                                    <span className="flex items-center justify-end gap-1">
                                      {hasPrev && delta > 0.3 && <span className="text-[10px]">▲</span>}
                                      {hasPrev && delta < -0.3 && <span className="text-[10px]">▼</span>}
                                      {pct.toFixed(1)}%
                                    </span>
                                  ) : "—"}
                                </td>
                              )
                            })}
                          </tr>
                          {isExpanded && codes.length > 0 && codes.map((code) => (
                            <tr key={`${catId}-${code.code}`} className="bg-zinc-50/80 border-b border-zinc-50">
                              <td className="py-1.5 pr-4 pl-10">
                                <span className="font-mono text-xs text-zinc-500">{code.code}</span>
                              </td>
                              <td colSpan={activeMonths.length} className="py-1.5 text-right text-xs text-zinc-500 pr-4">
                                {formatCurrency(code.discount)} — {code.count} utilisations
                              </td>
                            </tr>
                          ))}
                          </>
                        )
                      })}

                      {/* Total € row */}
                      <tr className="border-t-2 border-zinc-300 font-bold">
                        <td className="py-2.5 pr-4 text-zinc-900">Total €</td>
                        {activeMonths.map((m) => {
                          const total = getMonthTotal(m)
                          return (
                            <td
                              key={m}
                              className={`py-2.5 text-right text-zinc-900 ${
                                m === currentMonth ? "bg-zinc-50" : ""
                              }`}
                            >
                              {total > 0 ? formatCurrency(total) : "—"}
                            </td>
                          )
                        })}
                      </tr>

                      {/* CA row for context */}
                      <tr className="text-zinc-400 text-xs">
                        <td className="py-1.5 pr-4">CA du mois</td>
                        {activeMonths.map((m) => {
                          const rev = getMonthRevenue(m)
                          return (
                            <td
                              key={m}
                              className={`py-1.5 text-right ${
                                m === currentMonth ? "bg-zinc-50" : ""
                              }`}
                            >
                              {rev > 0 ? formatCurrency(rev) : "—"}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Taux global row */}
                      <tr className="font-semibold">
                        <td className="py-2.5 pr-4 text-zinc-500">Taux global (%)</td>
                        {activeMonths.map((m) => {
                          const rate = getMonthRate(m)
                          const prevRate = m > 1 ? getMonthRate(m - 1) : 0
                          const hasPrev = m > 1 && prevRate > 0
                          const delta = hasPrev ? rate - prevRate : 0
                          const isOver = rate > 20
                          return (
                            <td
                              key={m}
                              className={`py-2.5 text-right ${
                                m === currentMonth ? "bg-zinc-50" : ""
                              } ${
                                rate > 0
                                  ? isOver
                                    ? "text-red-600 font-bold"
                                    : "text-emerald-600"
                                  : "text-zinc-400"
                              }`}
                              title={hasPrev ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pts vs mois précédent` : ""}
                            >
                              {rate > 0 ? (
                                <span className="flex items-center justify-end gap-1">
                                  {hasPrev && delta > 0.5 && <span className="text-[10px]">▲</span>}
                                  {hasPrev && delta < -0.5 && <span className="text-[10px]">▼</span>}
                                  {rate}%
                                </span>
                              ) : "—"}
                            </td>
                          )
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
