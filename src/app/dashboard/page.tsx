"use client"

import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { LineChart } from "@/components/charts/line-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockInsights, mockSalesData, mockProjects } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import {
  ShoppingCart,
  Eye,
  TrendingUp,
  Users,
  Bot,
  Play,
} from "lucide-react"

const projectStatusColors: Record<string, "default" | "success" | "warning" | "info"> = {
  not_started: "default",
  in_progress: "info",
  on_hold: "warning",
  completed: "success",
}

const projectStatusLabels: Record<string, string> = {
  not_started: "Non démarré",
  in_progress: "En cours",
  on_hold: "En pause",
  completed: "Terminé",
}

export default function DashboardPage() {
  const totalRevenue = mockSalesData.reduce((sum, d) => sum + d.revenue, 0)
  const totalOrders = mockSalesData.reduce((sum, d) => sum + d.orders, 0)
  const avgConversion =
    mockSalesData.reduce((sum, d) => sum + d.conversionRate, 0) /
    mockSalesData.length

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Vue d'ensemble de l'activité Talika"
        actions={
          <Button variant="secondary" size="sm">
            <Play className="h-4 w-4" />
            Lancer tous les agents
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Chiffre d'affaires (Mars)"
            value={formatCurrency(totalRevenue)}
            change={12.5}
            changeLabel="vs fév."
            icon={<ShoppingCart className="h-5 w-5" />}
          />
          <KPICard
            label="Commandes"
            value={totalOrders}
            change={8.2}
            changeLabel="vs fév."
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KPICard
            label="Taux de conversion"
            value={`${avgConversion.toFixed(1)}%`}
            change={-0.3}
            changeLabel="vs fév."
            icon={<Eye className="h-5 w-5" />}
          />
          <KPICard
            label="Clients actifs"
            value="2 060"
            change={5.1}
            changeLabel="vs fév."
            icon={<Users className="h-5 w-5" />}
          />
        </div>

        {/* Charts + Insights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Évolution du CA</CardTitle>
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

          {/* Agent Insights */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Insights Agents
                </CardTitle>
                <Badge variant="info">{mockInsights.length} nouveaux</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {mockInsights.slice(0, 4).map((insight) => (
                  <AgentInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Projets en cours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mockProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-zinc-900">{project.name}</h4>
                    <Badge variant={projectStatusColors[project.status]}>
                      {projectStatusLabels[project.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 line-clamp-1">
                    {project.description}
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Progression</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-zinc-900 transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
