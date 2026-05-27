"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import { Button } from "@/components/ui/button"
import {
  Gift,
  Users,
  ShoppingBag,
  Truck,
  Headphones,
  Tag,
  Percent,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Package,
  ArrowUpDown,
  RefreshCw,
  Loader2,
} from "lucide-react"

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

interface ProductData {
  product_id: number
  title: string
  quantity_sold: number
  revenue: number
  ca_brut: number
  discount_allocated: number
  generosite_pct: number
  avg_price: number
  avg_compare_at: number
  prix_barre_discount: number
  orders: number
}

interface ProductsResponse {
  summary: {
    total_products: number
    total_revenue: number
    total_ca_brut: number
    total_discount_codes: number
    total_prix_barres: number
    overall_generosite_pct: number
  }
  products: ProductData[]
}

const CATEGORY_ICONS: Record<string, typeof Gift> = {
  gifting: Gift,
  influence: Users,
  welcome: Tag,
  offre_site: ShoppingBag,
  auto_discounts: Percent,
  logistique: Truck,
  service_client: Headphones,
  autre: HelpCircle,
}

const CATEGORY_COLORS: Record<string, string> = {
  gifting: "bg-purple-500",
  influence: "bg-blue-500",
  welcome: "bg-emerald-500",
  offre_site: "bg-amber-500",
  auto_discounts: "bg-cyan-500",
  logistique: "bg-red-500",
  service_client: "bg-zinc-400",
  autre: "bg-zinc-400",
}

const CATEGORY_BG: Record<string, string> = {
  gifting: "bg-purple-50 border-purple-200",
  influence: "bg-blue-50 border-blue-200",
  welcome: "bg-emerald-50 border-emerald-200",
  offre_site: "bg-amber-50 border-amber-200",
  auto_discounts: "bg-cyan-50 border-cyan-200",
  logistique: "bg-red-50 border-red-200",
  service_client: "bg-zinc-50 border-zinc-300 opacity-60",
  autre: "bg-zinc-50 border-zinc-200",
}

function CategoryCard({ cat }: { cat: CategoryData }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = CATEGORY_ICONS[cat.id] || Tag
  const barColor = CATEGORY_COLORS[cat.id] || "bg-zinc-400"
  const bgColor = CATEGORY_BG[cat.id] || "bg-zinc-50 border-zinc-200"

  return (
    <div className={`rounded-xl border p-4 ${bgColor}`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${barColor} text-white`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">
              {cat.label}
              {cat.excluded && <span className="ml-2 text-[10px] font-normal text-zinc-400 uppercase">exclu du taux</span>}
            </h3>
            <p className="text-xs text-zinc-500">{cat.orders} commandes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-lg font-bold text-zinc-900">{formatCurrency(cat.discount)}</p>
            <p className="text-xs text-zinc-500">{cat.generosite_pct}% du CA</p>
          </div>
          {cat.codes.length > 0 && (
            expanded
              ? <ChevronDown className="h-4 w-4 text-zinc-400" />
              : <ChevronRight className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Generosite % bar (scale 0-15%) */}
      <div className="mt-3 h-1.5 rounded-full bg-white/60">
        <div
          className={`h-1.5 rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(100, (cat.generosite_pct / 15) * 100)}%` }}
        />
      </div>

      {/* Expanded codes */}
      {expanded && cat.codes.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="grid grid-cols-3 text-[10px] sm:text-xs font-medium text-zinc-400 uppercase tracking-wider px-2">
            <span>Code</span>
            <span className="text-right">Montant</span>
            <span className="text-right">Utilisations</span>
          </div>
          {cat.codes.map((c) => (
            <div
              key={c.code}
              className="grid grid-cols-3 text-sm px-2 py-1 rounded hover:bg-white/50"
            >
              <span className="font-mono text-xs text-zinc-700">{c.code}</span>
              <span className="text-right text-zinc-600">{formatCurrency(c.discount)}</span>
              <span className="text-right text-zinc-500">{c.count}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

export default function GenerositePage() {
  const now = new Date()
  const [data, setData] = useState<GenerositeData | null>(null)
  const [productsData, setProductsData] = useState<ProductsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState<"categories" | "products">("categories")
  const [productSort, setProductSort] = useState<"generosite" | "revenue" | "quantity">("generosite")
  const [syncing, setSyncing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/generosite?year=${selectedYear}&month=${selectedMonth}`)
      const json = await res.json()
      if (!json.error) setData(json)
      else setData(null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth])

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await fetch(`/api/generosite/products?year=${selectedYear}&month=${selectedMonth}`)
      const json = await res.json()
      if (!json.error) setProductsData(json)
      else setProductsData(null)
    } catch {
      setProductsData(null)
    } finally {
      setProductsLoading(false)
    }
  }, [selectedYear, selectedMonth])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "orders", year: selectedYear, month: selectedMonth }),
      })
      await fetchData()
      if (tab === "products") await fetchProducts()
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }, [selectedYear, selectedMonth, tab, fetchData, fetchProducts])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (tab === "products") fetchProducts()
  }, [tab, fetchProducts])

  const target = 20 // 20% target

  const sortedProducts = productsData?.products
    ? [...productsData.products].sort((a, b) => {
        if (productSort === "revenue") return b.revenue - a.revenue
        if (productSort === "quantity") return b.quantity_sold - a.quantity_sold
        return b.generosite_pct - a.generosite_pct
      })
    : []

  return (
    <div>
      <Header
        title="Générosité"
        subtitle="Décomposition des discounts, gifting et coûts par catégorie"
        actions={
          <div className="flex items-center gap-2">
            <select
              className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
            <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Sync..." : "Sync Shopify"}
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <DataInsights page="generosite" />

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("categories")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "categories" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Tag className="h-4 w-4 inline mr-1.5" />
            Par catégorie
          </button>
          <button
            onClick={() => setTab("products")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "products" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Package className="h-4 w-4 inline mr-1.5" />
            Par produit
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-400">Chargement...</div>
        ) : !data ? (
          <div className="text-center py-12 text-zinc-400">Aucune donnée. Lancez une sync Shopify.</div>
        ) : tab === "categories" ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Taux de Générosité"
                value={`${data.generosite_rate}%`}
                icon={<Percent className="h-5 w-5" />}
                changeLabel={`Cible : ${target}%`}
              />
              <KPICard
                label="Total Discounts"
                value={formatCurrency(data.total_generosite)}
                icon={<Tag className="h-5 w-5" />}
              />
              <KPICard
                label="Commandes avec remise"
                value={`${data.orders_with_discount} / ${data.total_orders}`}
                icon={<ShoppingBag className="h-5 w-5" />}
                changeLabel={`${Math.round((data.orders_with_discount / data.total_orders) * 100)}% des commandes`}
              />
              <KPICard
                label={`CA ${MONTHS[selectedMonth - 1]}`}
                value={formatCurrency(data.total_revenue)}
                icon={<Gift className="h-5 w-5" />}
              />
            </div>

            {/* Target gauge */}
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-500">
                    Générosité vs Cible ({target}%)
                  </span>
                  <Badge variant={data.generosite_rate <= target ? "success" : "danger"}>
                    {data.generosite_rate <= target ? "OK" : "A réduire"}
                  </Badge>
                </div>
                <div className="relative h-4 rounded-full bg-zinc-100">
                  {/* Target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-zinc-900 z-10"
                    style={{ left: `${Math.min(100, (target / 40) * 100)}%` }}
                  />
                  {/* Actual bar */}
                  <div
                    className={`h-4 rounded-full transition-all ${
                      data.generosite_rate <= target ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, (data.generosite_rate / 40) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-zinc-400">0%</span>
                  <span className="text-xs text-zinc-600 font-medium">{data.generosite_rate}%</span>
                  <span className="text-xs text-zinc-400">40%</span>
                </div>
              </CardContent>
            </Card>

            {/* Stacked bar chart */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition par catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-8 rounded-lg overflow-hidden">
                  {data.categories.filter(c => c.discount > 0).map((cat) => {
                    // Width proportional to generosite_pct relative to total rate
                    const widthPct = data.generosite_rate > 0 ? (cat.generosite_pct / data.generosite_rate) * 100 : 0
                    return (
                      <div
                        key={cat.id}
                        className={`${CATEGORY_COLORS[cat.id] || "bg-zinc-400"} relative group`}
                        style={{ width: `${widthPct}%` }}
                        title={`${cat.label}: ${formatCurrency(cat.discount)} (${cat.generosite_pct}% du CA)`}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {widthPct > 10 && (
                            <span className="text-[10px] font-bold text-white drop-shadow">
                              {cat.generosite_pct}%
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {data.categories.filter(c => c.discount > 0).map((cat) => (
                    <div key={cat.id} className="flex items-center gap-1.5">
                      <div className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_COLORS[cat.id]}`} />
                      <span className="text-xs text-zinc-600">{cat.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category breakdown cards */}
            <div className="space-y-3">
              {data.categories.map((cat) => (
                <CategoryCard key={cat.id} cat={cat} />
              ))}
            </div>

            {/* ── Shipping section (hors générosité) ──────────── */}
            {data.shipping && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-zinc-500" />
                    <CardTitle>Frais de livraison</CardTitle>
                    <Badge variant="default" className="text-[10px]">Hors générosité</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                      <p className="text-xs text-emerald-600 font-medium">Livraison facturée</p>
                      <p className="text-xl font-bold text-emerald-700">{formatCurrency(data.shipping.revenue_collected)}</p>
                      <p className="text-xs text-emerald-500">{data.shipping.orders_paid} commandes</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs text-amber-600 font-medium">Livraison offerte</p>
                      <p className="text-xl font-bold text-amber-700">~{formatCurrency(data.shipping.estimated_free_cost)}</p>
                      <p className="text-xs text-amber-500">{data.shipping.orders_free} commandes (coût estimé)</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3">
                      <p className="text-xs text-zinc-500 font-medium">Taux livraison offerte</p>
                      <p className="text-xl font-bold text-zinc-700">{data.shipping.free_shipping_rate}%</p>
                      <p className="text-xs text-zinc-400">{data.shipping.orders_free} / {data.shipping.orders_paid + data.shipping.orders_free}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3">
                      <p className="text-xs text-zinc-500 font-medium">Frais moyen</p>
                      <p className="text-xl font-bold text-zinc-700">{formatCurrency(data.shipping.avg_shipping_price)}</p>
                      <p className="text-xs text-zinc-400">par commande payante</p>
                    </div>
                  </div>

                  {/* Shipping methods breakdown */}
                  {data.shipping.methods.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Méthodes de livraison</h4>
                      <div className="space-y-1">
                        {data.shipping.methods.map((m) => (
                          <div key={m.method} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-zinc-50 gap-1 sm:gap-0">
                            <span className="text-zinc-700">{m.method}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-zinc-500">{m.count} commandes</span>
                              <span className="font-medium text-zinc-700 min-w-[80px] text-right">{formatCurrency(m.revenue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          /* ── Products tab ────────────────────────── */
          productsLoading ? (
            <div className="text-center py-12 text-zinc-400">Chargement des produits...</div>
          ) : !productsData ? (
            <div className="text-center py-12 text-zinc-400">Aucune donnée produit disponible.</div>
          ) : (
            <>
              {/* Products KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Taux global"
                  value={`${productsData.summary.overall_generosite_pct}%`}
                  icon={<Percent className="h-5 w-5" />}
                  changeLabel={`Cible : ${target}%`}
                />
                <KPICard
                  label="Discounts codes"
                  value={formatCurrency(productsData.summary.total_discount_codes)}
                  icon={<Tag className="h-5 w-5" />}
                />
                <KPICard
                  label="Prix barrés"
                  value={formatCurrency(productsData.summary.total_prix_barres)}
                  icon={<ShoppingBag className="h-5 w-5" />}
                />
                <KPICard
                  label="Produits actifs"
                  value={String(productsData.summary.total_products)}
                  icon={<Package className="h-5 w-5" />}
                />
              </div>

              {/* Products table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Générosité par produit
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4 text-zinc-400" />
                      <select
                        className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white"
                        value={productSort}
                        onChange={e => setProductSort(e.target.value as typeof productSort)}
                      >
                        <option value="generosite">% Générosité</option>
                        <option value="revenue">CA</option>
                        <option value="quantity">Quantité</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left">
                          <th className="pb-2 font-medium text-zinc-500">Produit</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">Qté</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">CA</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">Prix moyen</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">Prix catalogue</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">Discount codes</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">Prix barrés</th>
                          <th className="pb-2 font-medium text-zinc-500 text-right">% Générosité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedProducts.map((p) => {
                          const isHigh = p.generosite_pct > target
                          return (
                            <tr key={`${p.product_id}_${p.title}`} className="border-b border-zinc-50 hover:bg-zinc-50">
                              <td className="py-2.5 pr-4">
                                <span className="font-medium text-zinc-900">{p.title}</span>
                              </td>
                              <td className="py-2.5 text-right text-zinc-600">{p.quantity_sold}</td>
                              <td className="py-2.5 text-right font-medium text-zinc-900">{formatCurrency(p.revenue)}</td>
                              <td className="py-2.5 text-right text-zinc-600">{formatCurrency(p.avg_price)}</td>
                              <td className="py-2.5 text-right text-zinc-500">
                                {p.avg_compare_at > p.avg_price ? formatCurrency(p.avg_compare_at) : "—"}
                              </td>
                              <td className="py-2.5 text-right text-zinc-600">
                                {p.discount_allocated > 0 ? formatCurrency(p.discount_allocated) : "—"}
                              </td>
                              <td className="py-2.5 text-right text-zinc-600">
                                {p.prix_barre_discount > 0 ? formatCurrency(p.prix_barre_discount) : "—"}
                              </td>
                              <td className="py-2.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-zinc-100">
                                    <div
                                      className={`h-1.5 rounded-full transition-all ${
                                        isHigh ? "bg-red-500" : p.generosite_pct > 15 ? "bg-amber-500" : "bg-emerald-500"
                                      }`}
                                      style={{ width: `${Math.min(100, (p.generosite_pct / 40) * 100)}%` }}
                                    />
                                  </div>
                                  <span className={`font-bold text-xs min-w-[40px] text-right ${
                                    isHigh ? "text-red-600" : "text-zinc-700"
                                  }`}>
                                    {p.generosite_pct}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )
        )}
      </div>
    </div>
  )
}
