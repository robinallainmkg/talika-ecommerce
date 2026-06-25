"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
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
  Package,
  ArrowUpDown,
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

interface VariantStats {
  product_id: number
  variant_id: number
  title: string
  variant_title: string
  sku: string
  quantity_sold: number
  revenue: number
  ca_brut: number
  discount_allocated: number
  prix_barre_discount: number
  generosite_pct: number
  avg_price: number
  avg_compare_at: number
  orders: number
  by_category: Record<string, number>
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

const CATEGORY_LABELS: Record<string, string> = {
  gifting: "Dotations",
  influence: "Influenceurs",
  welcome: "Codes génériques",
  offre_site: "Offre site",
  auto_discounts: "Remises auto",
  logistique: "Logistique",
  service_client: "SAV",
  autre: "Autres",
  prix_barres: "Prix barrés",
  presse: "Presse",
}

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]

// ─── Page ─────────────────────────────────────────────────────────

export default function GenerositePage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [tab, setTab] = useState<"categories" | "products">("categories")
  const [monthlyData, setMonthlyData] = useState<Record<number, GenerositeData>>({})
  const [products, setProducts] = useState<VariantStats[]>([])
  const [productMonth, setProductMonth] = useState(currentMonth)
  const [productsLoading, setProductsLoading] = useState(false)
  const [sortField, setSortField] = useState<"generosite_pct" | "discount_allocated" | "quantity_sold" | "revenue">("discount_allocated")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

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

  const fetchProducts = useCallback(async (m: number) => {
    setProductsLoading(true)
    try {
      const url = m > 0
        ? `/api/generosite/products?year=${currentYear}&month=${m}`
        : `/api/generosite/products?year=${currentYear}`
      const res = await fetch(url)
      const json = await res.json()
      setProducts(json.products || [])
    } catch {
      setProducts([])
    } finally {
      setProductsLoading(false)
    }
  }, [currentYear])

  useEffect(() => {
    if (tab === "products") fetchProducts(productMonth)
  }, [tab, productMonth, fetchProducts])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "orders", year: currentYear, month: currentMonth }),
      })
      await fetchAllMonths()
      if (tab === "products") await fetchProducts(productMonth)
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }, [currentYear, currentMonth, fetchAllMonths, tab, fetchProducts, productMonth])

  useEffect(() => {
    fetchAllMonths()
  }, [fetchAllMonths])

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

  // Get category generosite % (from API, computed against ca_brut)
  const getCategoryPct = (catId: string, month: number): number => {
    const d = monthlyData[month]
    if (!d) return 0
    const cat = d.categories.find((c) => c.id === catId)
    return cat?.generosite_pct || 0
  }

  // Get month revenue
  const getMonthRevenue = (month: number): number => {
    const d = monthlyData[month]
    return d ? d.total_revenue : 0
  }

  // Get codes detail for a category aggregated across all months
  const getCodesForCategory = (catId: string): CodeDetail[] => {
    const agg: Record<string, { discount: number; count: number }> = {}
    for (const m of activeMonths) {
      const d = monthlyData[m]
      if (!d) continue
      const cat = d.categories.find(c => c.id === catId)
      for (const code of cat?.codes || []) {
        if (!agg[code.code]) agg[code.code] = { discount: 0, count: 0 }
        agg[code.code].discount += code.discount
        agg[code.code].count += code.count
      }
    }
    return Object.entries(agg)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.discount - a.discount)
  }

  // Get amount for a specific code in a specific category/month
  const getCodeAmountForMonth = (catId: string, code: string, month: number): number => {
    const d = monthlyData[month]
    if (!d) return 0
    const cat = d.categories.find(c => c.id === catId)
    return cat?.codes?.find(c => c.code === code)?.discount || 0
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
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("categories")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === "categories" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Par catégorie
          </button>
          <button
            onClick={() => setTab("products")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              tab === "products" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Par produit
          </button>
        </div>

        {tab === "categories" && loading ? (
          <div className="text-center py-12 text-zinc-400">Chargement...</div>
        ) : tab === "categories" && Object.keys(monthlyData).length === 0 ? (
          <div className="text-center py-12 text-zinc-400">Aucune donnée. Lancez une sync Shopify.</div>
        ) : tab === "categories" ? (
          <>
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
                                ) : null}
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
                              {activeMonths.map((m) => {
                                const amt = getCodeAmountForMonth(catId, code.code, m)
                                return (
                                  <td key={m} className={`py-1.5 text-right text-xs text-zinc-400 ${m === currentMonth ? "bg-zinc-50" : ""}`}>
                                    {amt > 0 ? formatCurrency(amt) : "—"}
                                  </td>
                                )
                              })}
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
        ) : null}

        {/* Products tab */}
        {tab === "products" && (
          <>
            <div className="flex items-center gap-3">
              <select
                value={productMonth}
                onChange={(e) => setProductMonth(parseInt(e.target.value))}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              >
                {Array.from({ length: currentMonth }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{MONTH_LABELS[m - 1]} {currentYear}</option>
                ))}
                <option value={0}>Année complète</option>
              </select>
            </div>

            {productsLoading ? (
              <div className="text-center py-12 text-zinc-400">Chargement...</div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Générosité par produit / variant</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200">
                          <th className="pb-2 text-left font-medium text-zinc-500 min-w-[200px]">Produit</th>
                          <th className="pb-2 text-left font-medium text-zinc-500 min-w-[80px]">SKU</th>
                          <th className="pb-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900" onClick={() => { setSortField("generosite_pct"); setSortDir(prev => prev === "desc" ? "asc" : "desc") }}>
                            <span className="inline-flex items-center gap-1">Géné. % <ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th className="pb-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900" onClick={() => { setSortField("discount_allocated"); setSortDir(prev => prev === "desc" ? "asc" : "desc") }}>
                            <span className="inline-flex items-center gap-1">Remises € <ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th className="pb-2 text-right font-medium text-zinc-500">Prix barrés</th>
                          <th className="pb-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900" onClick={() => { setSortField("quantity_sold"); setSortDir(prev => prev === "desc" ? "asc" : "desc") }}>
                            <span className="inline-flex items-center gap-1">Qté <ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                          <th className="pb-2 text-right font-medium text-zinc-500">Prix moy.</th>
                          <th className="pb-2 text-right font-medium text-zinc-500">Compare at</th>
                          <th className="pb-2 text-right font-medium text-zinc-500 cursor-pointer hover:text-zinc-900" onClick={() => { setSortField("revenue"); setSortDir(prev => prev === "desc" ? "asc" : "desc") }}>
                            <span className="inline-flex items-center gap-1">CA <ArrowUpDown className="h-3 w-3" /></span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...products]
                          .sort((a, b) => sortDir === "desc" ? (b[sortField] - a[sortField]) : (a[sortField] - b[sortField]))
                          .map((p) => {
                          const rowKey = `${p.variant_id || p.product_id}-${p.sku}`
                          const isExpanded = expandedProducts.has(rowKey)
                          const isHigh = p.generosite_pct > 30
                          const byCat = p.by_category || {}
                          const catOrder = ["influence", "gifting", "welcome", "offre_site", "auto_discounts", "logistique", "service_client", "presse", "autre", "prix_barres"]
                          const catEntries = [
                            ...catOrder.filter(c => (byCat[c] || 0) > 0).map(c => [c, byCat[c]] as [string, number]),
                            ...Object.entries(byCat).filter(([c]) => !catOrder.includes(c) && byCat[c] > 0),
                          ]
                          return (
                            <>
                              <tr
                                key={rowKey}
                                className="border-b border-zinc-50 hover:bg-zinc-50/50 cursor-pointer"
                                onClick={() => setExpandedProducts(prev => {
                                  const next = new Set(prev)
                                  if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey)
                                  return next
                                })}
                              >
                                <td className="py-2 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    {isExpanded
                                      ? <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
                                      : <ChevronRight className="h-3 w-3 text-zinc-400 shrink-0" />}
                                    <div>
                                      <div className="text-zinc-900 font-medium text-xs">{p.title}</div>
                                      {p.variant_title && <div className="text-zinc-400 text-[11px]">{p.variant_title}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 text-xs font-mono text-zinc-500">{p.sku || "—"}</td>
                                <td className={`py-2 text-right font-semibold ${isHigh ? "text-red-600" : p.generosite_pct > 20 ? "text-amber-600" : "text-emerald-600"}`}>
                                  {p.generosite_pct}%
                                </td>
                                <td className="py-2 text-right text-zinc-600">{formatCurrency(p.discount_allocated)}</td>
                                <td className="py-2 text-right text-zinc-600">{p.prix_barre_discount > 0 ? formatCurrency(p.prix_barre_discount) : "—"}</td>
                                <td className="py-2 text-right text-zinc-600">{p.quantity_sold}</td>
                                <td className="py-2 text-right text-zinc-600">{formatCurrency(p.avg_price)}</td>
                                <td className="py-2 text-right text-zinc-500">{p.avg_compare_at !== p.avg_price ? formatCurrency(p.avg_compare_at) : "—"}</td>
                                <td className="py-2 text-right text-zinc-700 font-medium">{formatCurrency(p.revenue)}</td>
                              </tr>
                              {isExpanded && catEntries.length > 0 && catEntries.map(([cat, amt]) => {
                                const Icon = cat === "prix_barres" ? Tag : (CATEGORY_ICONS[cat] || HelpCircle)
                                const color = cat === "prix_barres" ? "text-amber-500" : (CATEGORY_COLORS[cat] || "text-zinc-400")
                                const label = CATEGORY_LABELS[cat] || cat
                                const pct = p.ca_brut > 0 ? Math.round((amt / p.ca_brut) * 1000) / 10 : 0
                                return (
                                  <tr key={`${rowKey}-${cat}`} className="bg-zinc-50/60 border-b border-zinc-50">
                                    <td className="py-1.5 pl-7 pr-2" colSpan={2}>
                                      <div className="flex items-center gap-1.5">
                                        <Icon className={`h-3 w-3 ${color}`} />
                                        <span className="text-xs text-zinc-500">{label}</span>
                                      </div>
                                    </td>
                                    <td className={`py-1.5 text-right text-xs font-medium ${color}`}>{pct}%</td>
                                    <td className="py-1.5 text-right text-xs text-zinc-500" colSpan={6}>{formatCurrency(amt)}</td>
                                  </tr>
                                )
                              })}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
