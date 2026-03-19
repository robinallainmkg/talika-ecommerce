"use client"

import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { Badge } from "@/components/ui/badge"
import { mockFlows, mockNewsletters, mockInsights } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import { Mail, MousePointer, DollarSign, Users, Bot } from "lucide-react"

const flowStatusColors: Record<string, "success" | "warning" | "default"> = {
  live: "success",
  draft: "default",
  paused: "warning",
}

export default function KlaviyoPage() {
  const totalFlowRevenue = mockFlows.reduce((s, f) => s + f.revenue, 0)
  const totalNLRevenue = mockNewsletters.reduce((s, n) => s + n.revenue, 0)
  const avgOpenRate =
    mockFlows.filter((f) => f.openRate > 0).reduce((s, f) => s + f.openRate, 0) /
    mockFlows.filter((f) => f.openRate > 0).length
  const avgClickRate =
    mockFlows.filter((f) => f.clickRate > 0).reduce((s, f) => s + f.clickRate, 0) /
    mockFlows.filter((f) => f.clickRate > 0).length

  const klaviyoInsights = mockInsights.filter((i) => i.agentType === "klaviyo")

  return (
    <div>
      <Header title="Klaviyo" subtitle="Flows, newsletters et performance email" />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="CA Flows"
            value={formatCurrency(totalFlowRevenue)}
            change={18.2}
            changeLabel="vs fév."
            icon={<DollarSign className="h-5 w-5" />}
          />
          <KPICard
            label="CA Newsletters"
            value={formatCurrency(totalNLRevenue)}
            change={5.1}
            changeLabel="vs fév."
            icon={<Mail className="h-5 w-5" />}
          />
          <KPICard
            label="Taux d'ouverture moy."
            value={`${avgOpenRate.toFixed(1)}%`}
            change={-1.2}
            changeLabel="vs fév."
            icon={<Users className="h-5 w-5" />}
          />
          <KPICard
            label="Taux de clic moy."
            value={`${avgClickRate.toFixed(1)}%`}
            change={0.5}
            changeLabel="vs fév."
            icon={<MousePointer className="h-5 w-5" />}
          />
        </div>

        {/* Flows */}
        <Card>
          <CardHeader>
            <CardTitle>Flows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Flow</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Statut</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Destinataires</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Ouverture</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Clic</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {mockFlows.map((flow) => (
                    <tr key={flow.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="py-3 font-medium text-zinc-900">{flow.name}</td>
                      <td className="py-3">
                        <Badge variant={flowStatusColors[flow.status]}>
                          {flow.status === "live" ? "Actif" : flow.status === "draft" ? "Brouillon" : "Pause"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-zinc-600">{flow.recipients.toLocaleString("fr-FR")}</td>
                      <td className="py-3 text-right text-zinc-600">{flow.openRate}%</td>
                      <td className="py-3 text-right text-zinc-600">{flow.clickRate}%</td>
                      <td className="py-3 text-right text-zinc-600">{formatCurrency(flow.revenue)}</td>
                      <td className="py-3 text-right text-zinc-600">{flow.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Newsletters */}
        <Card>
          <CardHeader>
            <CardTitle>Dernières Newsletters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Sujet</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Date</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Dest.</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Ouverture</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Clic</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {mockNewsletters.map((nl) => (
                    <tr key={nl.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="py-3 font-medium text-zinc-900 max-w-xs truncate">{nl.subject}</td>
                      <td className="py-3 text-zinc-600">{new Date(nl.sentAt).toLocaleDateString("fr-FR")}</td>
                      <td className="py-3 text-right text-zinc-600">{nl.recipients.toLocaleString("fr-FR")}</td>
                      <td className="py-3 text-right">
                        <Badge variant={nl.openRate > 30 ? "success" : "warning"}>
                          {nl.openRate}%
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-zinc-600">{nl.clickRate}%</td>
                      <td className="py-3 text-right text-zinc-600">{formatCurrency(nl.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent insights */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Klaviyo</CardTitle>
              <Badge variant="info">{klaviyoInsights.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {klaviyoInsights.map((insight) => (
                <AgentInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
