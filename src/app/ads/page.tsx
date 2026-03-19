"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { Megaphone, MousePointer, DollarSign, Target, Bot, Check, X } from "lucide-react"

// Mock data (will be replaced when Meta Ads connected)
const mockCampaigns = [
  { id: "1", name: "Lipocils Expert - Printemps", status: "active", budget: 5000, spend: 3200, impressions: 450000, clicks: 12500, ctr: 2.78, cpc: 0.26, conversions: 320, roas: 4.2, product: "Lipocils Expert" },
  { id: "2", name: "Retinol Spring Campaign", status: "active", budget: 3000, spend: 2100, impressions: 280000, clicks: 6800, ctr: 2.43, cpc: 0.31, conversions: 95, roas: 1.8, product: "Retinol" },
  { id: "3", name: "Light Therapy - Awareness", status: "active", budget: 2000, spend: 1500, impressions: 520000, clicks: 8200, ctr: 1.58, cpc: 0.18, conversions: 45, roas: 2.1, product: "Light Therapy" },
  { id: "4", name: "Remarketing - Abandon Panier", status: "active", budget: 1500, spend: 980, impressions: 85000, clicks: 4200, ctr: 4.94, cpc: 0.23, conversions: 180, roas: 6.8 },
  { id: "5", name: "Eyebrow Lipocil - UGC", status: "paused", budget: 2500, spend: 2500, impressions: 340000, clicks: 9800, ctr: 2.88, cpc: 0.26, conversions: 210, roas: 3.5, product: "Eyebrow Lipocil" },
  { id: "6", name: "Bio Enzymes Mask - Test", status: "active", budget: 1000, spend: 420, impressions: 62000, clicks: 1800, ctr: 2.90, cpc: 0.23, conversions: 28, roas: 2.8, product: "Bio Enzymes Mask" },
]

const statusColors: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  ended: "default",
}

interface Proposal {
  id: string
  title: string
  description: string
  priority: string
  status: string
}

export default function AdsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])

  useEffect(() => {
    supabase
      .from("agent_proposals")
      .select("*")
      .eq("agent_id", "meta_ads")
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

  const activeCampaigns = mockCampaigns.filter((c) => c.status === "active")
  const totalSpend = mockCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalConversions = mockCampaigns.reduce((s, c) => s + c.conversions, 0)
  const avgROAS = mockCampaigns.filter((c) => c.roas > 0).reduce((s, c) => s + c.roas, 0) / activeCampaigns.length
  const avgCTR = mockCampaigns.reduce((s, c) => s + c.ctr, 0) / mockCampaigns.length

  return (
    <div>
      <Header title="Analyse Meta Ads" subtitle="Performance des campagnes publicitaires" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Depenses totales" value={formatCurrency(totalSpend)} change={8.5} changeLabel="vs fev." icon={<DollarSign className="h-5 w-5" />} />
          <KPICard label="ROAS moyen" value={`${avgROAS.toFixed(1)}x`} change={-5.2} changeLabel="vs fev." icon={<Target className="h-5 w-5" />} />
          <KPICard label="Conversions" value={formatNumber(totalConversions)} change={12.3} changeLabel="vs fev." icon={<Megaphone className="h-5 w-5" />} />
          <KPICard label="CTR moyen" value={`${avgCTR.toFixed(2)}%`} change={0.8} changeLabel="vs fev." icon={<MousePointer className="h-5 w-5" />} />
        </div>

        <Card>
          <CardHeader><CardTitle>Campagnes</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-3 text-left font-medium text-zinc-500">Campagne</th>
                    <th className="pb-3 text-left font-medium text-zinc-500">Statut</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Budget</th>
                    <th className="pb-3 text-right font-medium text-zinc-500">Depense</th>
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
                        {campaign.product && <div className="text-xs text-zinc-400">{campaign.product}</div>}
                      </td>
                      <td className="py-3">
                        <Badge variant={statusColors[campaign.status]}>
                          {campaign.status === "active" ? "Actif" : campaign.status === "paused" ? "Pause" : "Termine"}
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

        {/* Agent proposals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Ads</CardTitle>
              {proposals.filter((p) => p.status === "pending").length > 0 && (
                <Badge variant="info">{proposals.filter((p) => p.status === "pending").length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune recommandation. Lancez l&apos;Agent Ads depuis la page Agents.</p>
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
