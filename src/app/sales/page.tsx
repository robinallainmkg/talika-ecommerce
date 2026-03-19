"use client"

import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { LineChart } from "@/components/charts/line-chart"
import { Badge } from "@/components/ui/badge"
import {
  mockSalesData,
  mockProducts,
  mockCustomerSegments,
  mockInsights,
} from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/utils"
import {
  ShoppingCart,
  TrendingUp,
  CreditCard,
  Percent,
  Bot,
} from "lucide-react"

export default function SalesPage() {
  const totalRevenue = mockSalesData.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = mockSalesData.reduce((s, d) => s + d.orders, 0)
  const avgAOV = totalRevenue / totalOrders
  const avgConversion =
    mockSalesData.reduce((s, d) => s + d.conversionRate, 0) / mockSalesData.length

  const salesInsights = mockInsights.filter((i) => i.agentType === "sales")

  return (
    <div>
      <Header title="Analyse des Ventes" subtitle="Performance produits et segments clients" />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="CA Mars"
            value={formatCurrency(totalRevenue)}
            change={12.5}
            changeLabel="vs fév."
            icon={<ShoppingCart className="h-5 w-5" />}
          />
          <KPICard
            label="Commandes"
            value={formatNumber(totalOrders)}
            change={8.2}
            changeLabel="vs fév."
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KPICard
            label="Panier moyen"
            value={formatCurrency(avgAOV)}
            change={3.8}
            changeLabel="vs fév."
            icon={<CreditCard className="h-5 w-5" />}
          />
          <KPICard
            label="Taux de conversion"
            value={`${avgConversion.toFixed(1)}%`}
            change={-0.3}
            changeLabel="vs fév."
            icon={<Percent className="h-5 w-5" />}
          />
        </div>

        {/* Revenue chart */}
        <Card>
          <CardHeader>
            <CardTitle>Évolution du CA et des commandes</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              data={mockSalesData}
              xKey="date"
              lines={[
                { key: "revenue", color: "#18181b", name: "CA (€)" },
                { key: "orders", color: "#a1a1aa", name: "Commandes" },
              ]}
              height={280}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Products table */}
          <Card>
            <CardHeader>
              <CardTitle>Top Produits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="pb-3 text-left font-medium text-zinc-500">Produit</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Unités</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockProducts.map((product) => (
                      <tr key={product.id} className="border-b border-zinc-100">
                        <td className="py-3">
                          <div className="font-medium text-zinc-900">{product.name}</div>
                          <div className="text-xs text-zinc-400">{product.sku}</div>
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {formatCurrency(product.revenue)}
                        </td>
                        <td className="py-3 text-right text-zinc-600">
                          {formatNumber(product.unitsSold)}
                        </td>
                        <td className="py-3 text-right">
                          <Badge
                            variant={product.conversionRate > 3 ? "success" : "default"}
                          >
                            {product.conversionRate.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Customer segments */}
          <Card>
            <CardHeader>
              <CardTitle>Segments Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockCustomerSegments.map((segment) => (
                  <div
                    key={segment.name}
                    className="rounded-lg border border-zinc-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-zinc-900">{segment.name}</h4>
                      <span className="text-sm text-zinc-500">
                        {formatNumber(segment.count)} clients
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-zinc-500">CA</span>
                        <div className="font-medium">{formatCurrency(segment.revenue)}</div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Panier moy.</span>
                        <div className="font-medium">{formatCurrency(segment.aov)}</div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Réachat</span>
                        <div className="font-medium">{segment.repeatRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent insights */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Ventes</CardTitle>
              <Badge variant="info">{salesInsights.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salesInsights.map((insight) => (
                <AgentInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
