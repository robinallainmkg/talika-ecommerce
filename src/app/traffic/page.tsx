"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/charts/line-chart"
import { BarChart } from "@/components/charts/bar-chart"
import { formatNumber } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { Globe, Clock, MousePointer, ArrowDownUp, Bot, Check, X } from "lucide-react"

// Mock data for traffic (will be replaced when GA4/Shopify connected)
const mockTrafficData = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 2, i + 1).toISOString().split("T")[0],
  sessions: Math.floor(800 + Math.random() * 600),
  pageviews: Math.floor(2000 + Math.random() * 1500),
}))

const trafficBySource = [
  { source: "Organic Search", sessions: 12500, percentage: 35 },
  { source: "Paid Social", sessions: 8200, percentage: 23 },
  { source: "Direct", sessions: 6100, percentage: 17 },
  { source: "Social Organic", sessions: 5300, percentage: 15 },
  { source: "Email", sessions: 2800, percentage: 8 },
  { source: "Referral", sessions: 700, percentage: 2 },
]

interface Proposal {
  id: string
  title: string
  description: string
  priority: string
  category: string
  status: string
}

export default function TrafficPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])

  useEffect(() => {
    supabase
      .from("agent_proposals")
      .select("*")
      .eq("agent_id", "traffic")
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

  const totalSessions = mockTrafficData.reduce((s, d) => s + d.sessions, 0)
  const totalPageviews = mockTrafficData.reduce((s, d) => s + d.pageviews, 0)

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
            changeLabel="vs fev."
            icon={<Globe className="h-5 w-5" />}
          />
          <KPICard
            label="Pages vues"
            value={formatNumber(totalPageviews)}
            change={12.1}
            changeLabel="vs fev."
            icon={<MousePointer className="h-5 w-5" />}
          />
          <KPICard
            label="Taux de rebond"
            value="44.2%"
            change={-2.4}
            changeLabel="vs fev."
            icon={<ArrowDownUp className="h-5 w-5" />}
          />
          <KPICard
            label="Duree moyenne"
            value="2m 35s"
            change={8.5}
            changeLabel="vs fev."
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
            <CardTitle>Detail par source</CardTitle>
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

        {/* Agent proposals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Traffic</CardTitle>
              {proposals.filter((p) => p.status === "pending").length > 0 && (
                <Badge variant="info">
                  {proposals.filter((p) => p.status === "pending").length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Aucune recommandation. Lancez l&apos;Agent Traffic depuis la page Agents.
              </p>
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
                      {p.status === "pending" && (
                        <div className="flex gap-1 ml-4 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => handleProposal(p.id, "approved")}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleProposal(p.id, "rejected")}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                      {p.status !== "pending" && (
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
