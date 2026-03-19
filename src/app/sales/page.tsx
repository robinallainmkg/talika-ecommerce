"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/charts/line-chart"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { ShoppingCart, TrendingUp, CreditCard, Percent, Bot, Check, X } from "lucide-react"

// Mock data (will be replaced when Shopify connected)
const mockSalesData = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 2, i + 1).toISOString().split("T")[0],
  revenue: Math.floor(2000 + Math.random() * 5000),
  orders: Math.floor(20 + Math.random() * 40),
}))

const mockProducts = [
  { id: "1", name: "Lipocils Expert", sku: "LCE-001", revenue: 45200, unitsSold: 1120, conversionRate: 4.2 },
  { id: "2", name: "Eyebrow Lipocil", sku: "EBL-001", revenue: 28300, unitsSold: 780, conversionRate: 3.8 },
  { id: "3", name: "Light Therapy By Talika", sku: "LTB-001", revenue: 22100, unitsSold: 340, conversionRate: 2.9 },
  { id: "4", name: "Eye Decompress", sku: "EDC-001", revenue: 18500, unitsSold: 520, conversionRate: 3.1 },
  { id: "5", name: "Lash Conditioning Cleanser", sku: "LCC-001", revenue: 12800, unitsSold: 640, conversionRate: 2.4 },
  { id: "6", name: "Skin Retouch", sku: "SKR-001", revenue: 9800, unitsSold: 280, conversionRate: 1.9 },
  { id: "7", name: "Bio Enzymes Mask", sku: "BEM-001", revenue: 8200, unitsSold: 410, conversionRate: 2.2 },
  { id: "8", name: "Eye Therapy Patch", sku: "ETP-001", revenue: 7400, unitsSold: 370, conversionRate: 2.0 },
]

const mockSegments = [
  { name: "Nouveaux clients", count: 1200, revenue: 54000, aov: 45, repeatRate: 0 },
  { name: "Clients fideles (2-5 achats)", count: 680, revenue: 47600, aov: 70, repeatRate: 65 },
  { name: "VIP (5+ achats)", count: 180, revenue: 27000, aov: 95, repeatRate: 88 },
  { name: "Inactifs (>6 mois)", count: 2400, revenue: 0, aov: 0, repeatRate: 12 },
]

interface Proposal {
  id: string
  title: string
  description: string
  priority: string
  status: string
}

export default function SalesPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])

  useEffect(() => {
    supabase
      .from("agent_proposals")
      .select("*")
      .eq("agent_id", "sales")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setProposals(data || []))
  }, [])

  const handleProposal = async (id: string, status: "approved" | "rejected") => {
    await supabase
      .from("agent_proposals")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id)
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
  }

  const totalRevenue = mockSalesData.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = mockSalesData.reduce((s, d) => s + d.orders, 0)
  const avgAOV = totalRevenue / totalOrders

  return (
    <div>
      <Header title="Analyse des Ventes" subtitle="Performance produits et segments clients" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="CA Mars" value={formatCurrency(totalRevenue)} change={12.5} changeLabel="vs fev." icon={<ShoppingCart className="h-5 w-5" />} />
          <KPICard label="Commandes" value={formatNumber(totalOrders)} change={8.2} changeLabel="vs fev." icon={<TrendingUp className="h-5 w-5" />} />
          <KPICard label="Panier moyen" value={formatCurrency(avgAOV)} change={3.8} changeLabel="vs fev." icon={<CreditCard className="h-5 w-5" />} />
          <KPICard label="Taux de conversion" value="2.4%" change={-0.3} changeLabel="vs fev." icon={<Percent className="h-5 w-5" />} />
        </div>

        <Card>
          <CardHeader><CardTitle>Evolution du CA et des commandes</CardTitle></CardHeader>
          <CardContent>
            <LineChart
              data={mockSalesData}
              xKey="date"
              lines={[
                { key: "revenue", color: "#18181b", name: "CA" },
                { key: "orders", color: "#a1a1aa", name: "Commandes" },
              ]}
              height={280}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Top Produits</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="pb-3 text-left font-medium text-zinc-500">Produit</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                      <th className="pb-3 text-right font-medium text-zinc-500">Unites</th>
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
                        <td className="py-3 text-right text-zinc-600">{formatCurrency(product.revenue)}</td>
                        <td className="py-3 text-right text-zinc-600">{formatNumber(product.unitsSold)}</td>
                        <td className="py-3 text-right">
                          <Badge variant={product.conversionRate > 3 ? "success" : "default"}>
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

          <Card>
            <CardHeader><CardTitle>Segments Clients</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockSegments.map((segment) => (
                  <div key={segment.name} className="rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-zinc-900">{segment.name}</h4>
                      <span className="text-sm text-zinc-500">{formatNumber(segment.count)} clients</span>
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
                        <span className="text-zinc-500">Reachat</span>
                        <div className="font-medium">{segment.repeatRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent proposals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Ventes</CardTitle>
              {proposals.filter((p) => p.status === "pending").length > 0 && (
                <Badge variant="info">{proposals.filter((p) => p.status === "pending").length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune recommandation. Lancez l&apos;Agent Ventes depuis la page Agents.</p>
            ) : (
              <div className="space-y-3">
                {proposals.map((p) => (
                  <div key={p.id} className="rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-zinc-900">{p.title}</h4>
                          <Badge variant={p.priority === "high" || p.priority === "urgent" ? "danger" : p.priority === "medium" ? "warning" : "default"}>
                            {p.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-600">{p.description}</p>
                      </div>
                      {p.status === "pending" ? (
                        <div className="flex gap-1 ml-4 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => handleProposal(p.id, "approved")}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleProposal(p.id, "rejected")}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant={p.status === "approved" ? "success" : "danger"}>
                          {p.status === "approved" ? "Approuve" : "Rejete"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
