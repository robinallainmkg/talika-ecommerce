"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { Mail, MousePointer, DollarSign, Users, Bot, Check, X } from "lucide-react"

// Mock data (will be replaced when Klaviyo connected)
const mockFlows = [
  { id: "1", name: "Welcome Series", status: "live", recipients: 8500, openRate: 52.3, clickRate: 8.2, revenue: 12400, conversionRate: 3.1 },
  { id: "2", name: "Abandon de panier", status: "live", recipients: 4200, openRate: 38.1, clickRate: 4.5, revenue: 28600, conversionRate: 5.8 },
  { id: "3", name: "Post-achat", status: "live", recipients: 3100, openRate: 45.2, clickRate: 6.1, revenue: 8200, conversionRate: 2.4 },
  { id: "4", name: "Browse Abandonment", status: "live", recipients: 6800, openRate: 32.5, clickRate: 3.2, revenue: 5600, conversionRate: 1.8 },
  { id: "5", name: "Win-back 90 jours", status: "live", recipients: 2100, openRate: 28.4, clickRate: 2.8, revenue: 3200, conversionRate: 1.2 },
  { id: "6", name: "Anniversaire", status: "draft", recipients: 0, openRate: 0, clickRate: 0, revenue: 0, conversionRate: 0 },
]

const mockNewsletters = [
  { id: "1", subject: "Nouveaute : Decouvrez notre gamme Retinol", sentAt: "2026-03-15", recipients: 45000, openRate: 28.5, clickRate: 4.2, revenue: 8500 },
  { id: "2", subject: "Offre Printemps -20% sur Lipocils", sentAt: "2026-03-10", recipients: 45000, openRate: 35.2, clickRate: 6.8, revenue: 15200 },
  { id: "3", subject: "Les secrets d'un regard sublime", sentAt: "2026-03-05", recipients: 44500, openRate: 24.1, clickRate: 3.1, revenue: 4200 },
  { id: "4", subject: "Votre routine soin du regard", sentAt: "2026-02-28", recipients: 44000, openRate: 26.8, clickRate: 3.8, revenue: 5800 },
]

const flowStatusColors: Record<string, "success" | "warning" | "default"> = {
  live: "success",
  draft: "default",
  paused: "warning",
}

interface Proposal {
  id: string
  title: string
  description: string
  priority: string
  status: string
}

export default function KlaviyoPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])

  useEffect(() => {
    supabase
      .from("agent_proposals")
      .select("*")
      .eq("agent_id", "klaviyo")
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

  const totalFlowRevenue = mockFlows.reduce((s, f) => s + f.revenue, 0)
  const totalNLRevenue = mockNewsletters.reduce((s, n) => s + n.revenue, 0)
  const avgOpenRate = mockFlows.filter((f) => f.openRate > 0).reduce((s, f) => s + f.openRate, 0) / mockFlows.filter((f) => f.openRate > 0).length
  const avgClickRate = mockFlows.filter((f) => f.clickRate > 0).reduce((s, f) => s + f.clickRate, 0) / mockFlows.filter((f) => f.clickRate > 0).length

  return (
    <div>
      <Header title="Klaviyo" subtitle="Flows, newsletters et performance email" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="CA Flows" value={formatCurrency(totalFlowRevenue)} change={18.2} changeLabel="vs fev." icon={<DollarSign className="h-5 w-5" />} />
          <KPICard label="CA Newsletters" value={formatCurrency(totalNLRevenue)} change={5.1} changeLabel="vs fev." icon={<Mail className="h-5 w-5" />} />
          <KPICard label="Taux d'ouverture moy." value={`${avgOpenRate.toFixed(1)}%`} change={-1.2} changeLabel="vs fev." icon={<Users className="h-5 w-5" />} />
          <KPICard label="Taux de clic moy." value={`${avgClickRate.toFixed(1)}%`} change={0.5} changeLabel="vs fev." icon={<MousePointer className="h-5 w-5" />} />
        </div>

        {/* Flows */}
        <Card>
          <CardHeader><CardTitle>Flows</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>Dernieres Newsletters</CardTitle></CardHeader>
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
                        <Badge variant={nl.openRate > 30 ? "success" : "warning"}>{nl.openRate}%</Badge>
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

        {/* Agent proposals */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-400" />
              <CardTitle>Recommandations Agent Klaviyo</CardTitle>
              {proposals.filter((p) => p.status === "pending").length > 0 && (
                <Badge variant="info">{proposals.filter((p) => p.status === "pending").length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune recommandation. Lancez l&apos;Agent Klaviyo depuis la page Agents.</p>
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
