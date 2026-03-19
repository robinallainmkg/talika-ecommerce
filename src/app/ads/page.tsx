"use client"

import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { Badge } from "@/components/ui/badge"
import { mockCampaigns, mockInsights } from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { Megaphone, MousePointer, DollarSign, Target, Bot } from "lucide-react"

const statusColors: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  ended: "default",
}

export default function AdsPage() {
  const activeCampaigns = mockCampaigns.filter((c) => c.status === "active")
  const totalSpend = mockCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalConversions = mockCampaigns.reduce((s, c) => s + c.conversions, 0)
  const avgROAS =
    mockCampaigns
      .filter((c) => c.roas > 0)
      .reduce((s, c) => s + c.roas, 0) / activeCampaigns.length
  const avgCTR =
    mockCampaigns.reduce((s, c) => s + c.ctr, 0) / mockCampaigns.length

  const adsInsights = mockInsights.filter((i) => i.agentType === "ads")

  return (
    <div>
      <Header title="Analyse Meta Ads" subtitle="Performance des campagnes publicitaires" />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Dépenses totales"
            value={formatCurrency(totalSpend)}
            change={8.5}
            changeLabel="vs fév."
            icon={<DollarSign className="h-5 w-5" />}
          />
          <KPICard
            label="ROAS moyen"
            value={`${avgROAS.toFixed(1)}x`}
            change={-5.2}
            changeLabel="vs fév."
            icon={<Target className="h-5 w-5" />}
          />
          <KPICard
            label="Conversions"
            value={formatNumber(totalConversions)}
            change={12.3}
            changeLabel="vs fév."
            icon={<Megaphone className="h-5 w-5" />}
          />
          <KPICard
            label="CTR moyen"
            value={`${avgCTR.toFixed(2)}%`}
            change={0.8}
            changeLabel="vs fév."
            icon={<MousePointer className="h-5 w-5" />}
          />
        </div>

        {/* Campaigns table */}
        <Card>
          <CardHeader>
            <CardTitle>Campagnes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Campagne</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Statut</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Budget</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Dépensé</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Impressions</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Clics</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CTR</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">CPC</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Conv.</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {mockCampaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="py-3">
                        <div className="font-medium text-zinc-900">{campaign.name}</div>
                        {campaign.product && (
                          <div className="text-xs text-zinc-400">{campaign.product}</div>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant={statusColors[campaign.status]}>
                          {campaign.status === "active" ? "Actif" : campaign.status === "paused" ? "Pause" : "Terminé"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-zinc-600">{formatCurrency(campaign.budget)}</td>
                      <td className="py-3 text-right text-zinc-600">{formatCurrency(campaign.spend)}</td>
                      <td className="py-3 text-right text-zinc-600">{formatNumber(campaign.impressions)}</td>
                      <td className="py-3 text-right text-zinc-600">{formatNumber(campaign.clicks)}</td>
                      <td className="py-3 text-right text-zinc-600">{campaign.ctr.toFixed(2)}%</td>
                      <td className="py-3 text-right text-zinc-600">{formatCurrency(campaign.cpc)}</td>
                      <td className="py-3 text-right text-zinc-600">{campaign.conversions}</td>
                      <td className="py-3 text-right">
                        <Badge variant={campaign.roas >= 3 ? "success" : campaign.roas >= 2 ? "warning" : "danger"}>
                          {campaign.roas.toFixed(1)}x
                        </Badge>
                      </td>
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
              <CardTitle>Recommandations Agent Ads</CardTitle>
              <Badge variant="info">{adsInsights.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {adsInsights.map((insight) => (
                <AgentInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
