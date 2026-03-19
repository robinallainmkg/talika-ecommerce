"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { LineChart } from "@/components/charts/line-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import type { AgentInsight } from "@/types"
import {
  ShoppingCart,
  Eye,
  TrendingUp,
  Users,
  Bot,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  FolderKanban,
} from "lucide-react"

// --- Mock KPI & chart data (Shopify non connecté) ---

const mockSalesData = [
  { date: "2026-03-01", revenue: 4200, orders: 38, conversionRate: 2.1 },
  { date: "2026-03-02", revenue: 3800, orders: 32, conversionRate: 1.9 },
  { date: "2026-03-03", revenue: 5100, orders: 45, conversionRate: 2.4 },
  { date: "2026-03-04", revenue: 4700, orders: 41, conversionRate: 2.2 },
  { date: "2026-03-05", revenue: 6200, orders: 52, conversionRate: 2.8 },
  { date: "2026-03-06", revenue: 5500, orders: 48, conversionRate: 2.5 },
  { date: "2026-03-07", revenue: 4900, orders: 43, conversionRate: 2.3 },
  { date: "2026-03-08", revenue: 5800, orders: 50, conversionRate: 2.6 },
  { date: "2026-03-09", revenue: 4300, orders: 37, conversionRate: 2.0 },
  { date: "2026-03-10", revenue: 6100, orders: 53, conversionRate: 2.7 },
  { date: "2026-03-11", revenue: 5400, orders: 46, conversionRate: 2.4 },
  { date: "2026-03-12", revenue: 6800, orders: 58, conversionRate: 3.0 },
  { date: "2026-03-13", revenue: 5900, orders: 51, conversionRate: 2.6 },
  { date: "2026-03-14", revenue: 7200, orders: 62, conversionRate: 3.2 },
]

const totalRevenue = mockSalesData.reduce((sum, d) => sum + d.revenue, 0)
const totalOrders = mockSalesData.reduce((sum, d) => sum + d.orders, 0)
const avgConversion =
  mockSalesData.reduce((sum, d) => sum + d.conversionRate, 0) /
  mockSalesData.length

// --- Status helpers ---

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

// --- Supabase row types ---

interface AgentProposalRow {
  id: string
  agent_type: string
  title: string
  description: string
  severity: "info" | "warning" | "success" | "critical"
  category: string
  actionable: boolean
  suggested_action?: string
  status: "pending" | "approved" | "rejected"
  created_at: string
  data?: Record<string, unknown>
}

interface ProjectRow {
  id: string
  name: string
  description: string
  status: string
  progress: number
  start_date?: string
  end_date?: string
}

interface CalendarEventRow {
  id: string
  title: string
  type: string
  date: string
  end_date?: string
  channel: string[]
  status: string
  description?: string
  assignee?: string
}

// --- Helpers ---

function proposalToInsight(row: AgentProposalRow): AgentInsight {
  return {
    id: row.id,
    agentType: (row.agent_type || "coach") as AgentInsight["agentType"],
    title: row.title,
    description: row.description,
    severity: row.severity,
    category: row.category,
    actionable: row.actionable,
    suggestedAction: row.suggested_action,
    createdAt: row.created_at,
    data: row.data,
  }
}

export default function DashboardPage() {
  const [proposals, setProposals] = useState<AgentProposalRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [events, setEvents] = useState<CalendarEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      const [proposalsRes, projectsRes, eventsRes] = await Promise.all([
        supabase
          .from("agent_proposals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("calendar_events")
          .select("*")
          .gte("date", new Date().toISOString().split("T")[0])
          .order("date", { ascending: true })
          .limit(5),
      ])

      if (proposalsRes.data) setProposals(proposalsRes.data)
      if (projectsRes.data) setProjects(projectsRes.data)
      if (eventsRes.data) setEvents(eventsRes.data)

      setLoading(false)
    }

    fetchData()
  }, [])

  async function handleProposalAction(id: string, action: "approved" | "rejected") {
    setActionLoading(id)
    const { error } = await supabase
      .from("agent_proposals")
      .update({ status: action })
      .eq("id", id)

    if (!error) {
      setProposals((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: action } : p))
      )
    }
    setActionLoading(null)
  }

  const pendingProposals = proposals.filter((p) => p.status === "pending")

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
        {/* KPIs (données mock — Shopify non connecté) */}
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

          {/* Agent Insights — real data from Supabase */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Insights Agents
                </CardTitle>
                <Badge variant="info">
                  {loading ? "…" : `${pendingProposals.length} en attente`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Chargement…
                </div>
              ) : proposals.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">
                  Aucune proposition d&apos;agent pour le moment.
                </p>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {proposals.map((proposal) => (
                    <div key={proposal.id}>
                      <AgentInsightCard insight={proposalToInsight(proposal)} />
                      {proposal.status === "pending" && (
                        <div className="mt-1.5 flex items-center gap-2 pl-8">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-7 text-xs"
                            disabled={actionLoading === proposal.id}
                            onClick={() => handleProposalAction(proposal.id, "approved")}
                          >
                            {actionLoading === proposal.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            )}
                            Approuver
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
                            disabled={actionLoading === proposal.id}
                            onClick={() => handleProposalAction(proposal.id, "rejected")}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Rejeter
                          </Button>
                        </div>
                      )}
                      {proposal.status === "approved" && (
                        <div className="mt-1 pl-8">
                          <Badge variant="success">Approuvé</Badge>
                        </div>
                      )}
                      {proposal.status === "rejected" && (
                        <div className="mt-1 pl-8">
                          <Badge variant="default">Rejeté</Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Calendar Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Événements à venir
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Chargement…
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                Aucun événement à venir.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border border-zinc-200 p-3 hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="info">{event.type}</Badge>
                      <span className="text-xs text-zinc-400">
                        {new Date(event.date).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-medium text-zinc-900 line-clamp-2">
                      {event.title}
                    </h4>
                    {event.channel && event.channel.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {event.channel.map((ch) => (
                          <span
                            key={ch}
                            className="text-[10px] rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Overview — from Supabase */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Projets en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Chargement…
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">
                Aucun projet trouvé.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-zinc-900">{project.name}</h4>
                      <Badge variant={projectStatusColors[project.status] || "default"}>
                        {projectStatusLabels[project.status] || project.status}
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
