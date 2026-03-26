"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LineChart } from "@/components/charts/line-chart"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { PageInsightsPanel } from "@/components/agents/page-insights-panel"
import {
  ShoppingCart,
  TrendingUp,
  CreditCard,
  Tag,
  Loader2,
} from "lucide-react"

interface ShopifyAnalytics {
  total_revenue: number
  total_orders: number
  aov: number
  unique_customers: number
  total_discount: number
  generosity: number
}

interface ProductSale {
  title: string
  quantity: number
  revenue: number
  orders: number
}

export default function SalesPage() {
  const [analytics, setAnalytics] = useState<ShopifyAnalytics | null>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<ProductSale[]>([])
  const [discountBreakdown, setDiscountBreakdown] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [, setSyncing] = useState(false)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const monthName = now.toLocaleDateString("fr-FR", { month: "long" })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Analytics KPIs
      const { data: cacheData } = await supabase
        .from("data_cache")
        .select("key, data")
        .eq("source", "shopify")
        .in("key", [
          `shopify_analytics_${currentYear}_${currentMonth}`,
          `shopify_orders_${currentYear}_${currentMonth}`,
        ])

      const cacheMap = new Map((cacheData || []).map(e => [e.key, e.data]))
      const analyticsData = cacheMap.get(`shopify_analytics_${currentYear}_${currentMonth}`)
      if (analyticsData) {
        setAnalytics(analyticsData as any)
      }

      // 2. Build chart + products from orders
      const ordersData = cacheMap.get(`shopify_orders_${currentYear}_${currentMonth}`) as any
      const orders = ordersData?.orders || []

      if (orders.length > 0) {
        // Daily chart data
        const dailyMap: Record<string, { date: string; revenue: number; orders: number }> = {}
        for (const o of orders) {
          const day = o.created_at?.split("T")[0]
          if (!day) continue
          if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, orders: 0 }
          dailyMap[day].revenue += parseFloat(o.total_price || "0")
          dailyMap[day].orders += 1
        }
        setChartData(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)))

        // Top products from line_items
        const productMap: Record<string, ProductSale> = {}
        for (const o of orders) {
          for (const item of o.line_items || []) {
            const title = item.title || "Inconnu"
            if (!productMap[title]) productMap[title] = { title, quantity: 0, revenue: 0, orders: 0 }
            productMap[title].quantity += item.quantity || 1
            productMap[title].revenue += parseFloat(item.price || "0") * (item.quantity || 1)
            productMap[title].orders += 1
          }
        }
        setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 15))

        // Discount code breakdown
        const codeMap: Record<string, { code: string; orders: number; revenue: number; discount: number }> = {}
        for (const o of orders) {
          for (const dc of o.discount_codes || []) {
            const code = dc.code || "?"
            if (!codeMap[code]) codeMap[code] = { code, orders: 0, revenue: 0, discount: 0 }
            codeMap[code].orders += 1
            codeMap[code].revenue += parseFloat(o.total_price || "0")
            codeMap[code].discount += parseFloat(dc.amount || "0")
          }
        }
        setDiscountBreakdown(Object.values(codeMap).sort((a, b) => b.orders - a.orders).slice(0, 15))
      }
    } catch (err) {
      console.error("Sales load error:", err)
    } finally {
      setLoading(false)
    }
  }, [currentYear, currentMonth])

  useEffect(() => { loadData() }, [loadData])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      })
      await loadData()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <Header
        title="Analyse des Ventes"
        subtitle={`Performance produits et codes promo — ${monthName} ${currentYear}`}
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Insights */}
        <PageInsightsPanel agentId="sales" pageContext="sales" title="Insights Ventes" />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="ml-2 text-zinc-500">Chargement...</span>
          </div>
        ) : !analytics ? (
          <div className="text-center py-12 text-zinc-500">
            Aucune donnée. Cliquez sur &quot;Sync Shopify&quot; pour charger les ventes.
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label={`CA ${monthName}`}
                value={formatCurrency(analytics.total_revenue)}
                icon={<ShoppingCart className="h-5 w-5" />}
              />
              <KPICard
                label="Commandes"
                value={formatNumber(analytics.total_orders)}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <KPICard
                label="Panier moyen"
                value={formatCurrency(analytics.aov)}
                icon={<CreditCard className="h-5 w-5" />}
              />
              <KPICard
                label="Générosité"
                value={`${analytics.generosity.toFixed(1)}%`}
                icon={<Tag className="h-5 w-5" />}
              />
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Évolution du CA et des commandes</CardTitle></CardHeader>
                <CardContent>
                  <LineChart
                    data={chartData}
                    xKey="date"
                    lines={[
                      { key: "revenue", color: "#18181b", name: "CA (€)" },
                      { key: "orders", color: "#a1a1aa", name: "Commandes" },
                    ]}
                    height={280}
                  />
                </CardContent>
              </Card>
            )}

            {/* Products + Codes */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top Products */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Produits</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200">
                          <th className="pb-3 text-left font-medium text-zinc-500 min-w-[150px]">Produit</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Qté</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((p, i) => (
                          <tr key={p.title} className="border-b border-zinc-100">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-400 w-4">{i + 1}</span>
                                <span className="font-medium text-zinc-900 text-sm">{p.title}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-zinc-600">{formatCurrency(p.revenue)}</td>
                            <td className="py-2.5 text-right text-zinc-600">{formatNumber(p.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Discount Codes */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Codes Promo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200">
                          <th className="pb-3 text-left font-medium text-zinc-500 min-w-[100px]">Code</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Commandes</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                          <th className="pb-3 text-right font-medium text-zinc-500">Remise</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discountBreakdown.map((d) => (
                          <tr key={d.code} className="border-b border-zinc-100">
                            <td className="py-2.5">
                              <Badge variant="default" className="font-mono text-xs">{d.code}</Badge>
                            </td>
                            <td className="py-2.5 text-right text-zinc-600">{d.orders}</td>
                            <td className="py-2.5 text-right text-zinc-600">{formatCurrency(d.revenue)}</td>
                            <td className="py-2.5 text-right text-zinc-600">{formatCurrency(d.discount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
