"use client"

import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { LineChart } from "@/components/charts/line-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { Badge } from "@/components/ui/badge"
import { mockTrafficData, trafficBySource, mockInsights } from "@/lib/mock-data"
import { formatNumber } from "@/lib/utils"
import { Globe, Clock, MousePointer, ArrowDownUp, Bot } from "lucide-react"

export default function TrafficPage() {
  const totalSessions = mockTrafficData.reduce((s, d) => s + d.sessions, 0)
  const totalPageviews = mockTrafficData.reduce((s, d) => s + d.pageviews, 0)
  const avgBounce =
    mockTrafficData.reduce((s, d) => s + d.bounceRate, 0) / mockTrafficData.length
  const avgDuration =
    mockTrafficData.reduce((s, d) => s + d.avgDuration, 0) / mockTrafficData.length

  const trafficInsights = mockInsights.filter((i) => i.agentType === "traffic")

  return (
    <div>
      <Header title="Analyse du Traffic" subtitle="Sources, comportement et tendances" />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Sessions (Mars)"
            value={formatNumber(totalSessions)}
            change={15.3}
            changeLabel="vs fév."
            icon={<Globe className="h-5 w-5" />}
          />
          <KPICard
            label="Pages vues"
            value={formatNumber(totalPageviews)}
            change={12.1}
            changeLabel="vs fév."
            icon={<MousePointer className="h-5 w-5" />}
          />
          <KPICard
            label="Taux de rebond"
            value={`${avgBounce.toFixed(1)}%`}
            change={-2.4}
            changeLabel="vs fév."
            icon={<ArrowDownUp className="h-5 w-5" />}
          />
          <KPICard
            label="Durée moyenne"
            value={`${Math.floor(avgDuration / 60)}m ${Math.floor(avgDuration % 60)}s`}
            change={8.5}
            changeLabel="vs fév."
            icon={<Clock className="h-5 w-5" />}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sessions par jour</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                data={mockTrafficData}
                xKey="date"
                lines={[
                  { key: "sessions", color: "#18181b", name: "Sessions" },
                  { key: "pageviews", color: "#a1a1aa", name: "Pages vues" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources de trafic</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={trafficBySource}
                xKey="source"
                bars={[{ key: "sessions", color: "#18181b", name: "Sessions" }]}
                layout="vertical"
              />
            </CardContent>
          </Card>
        </div>

        {/* Source breakdown table */}
        <Card>
          <CardHeader>
            <CardTitle>Détail par source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Source</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Sessions</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">% du total</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficBySource.map((source) => (
                    <tr key={source.source} className="border-b border-zinc-100">
                      <td className="py-3 font-medium text-zinc-900">{source.source}</td>
                      <td className="py-3 text-right text-zinc-600">
                        {formatNumber(source.sessions)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-zinc-100">
                            <div
                              className="h-1.5 rounded-full bg-zinc-900"
                              style={{ width: `${source.percentage}%` }}
                            />
                          </div>
                          <span className="text-zinc-600">{source.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent insights */}
        {trafficInsights.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-zinc-400" />
                <CardTitle>Recommandations Agent Traffic</CardTitle>
                <Badge variant="info">{trafficInsights.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trafficInsights.map((insight) => (
                  <AgentInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
