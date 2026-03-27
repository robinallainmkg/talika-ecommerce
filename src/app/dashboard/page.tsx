"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { Header } from "@/components/layout/header"
import { KPICard } from "@/components/ui/kpi-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { LineChart } from "@/components/charts/line-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { DataInsights } from "@/components/data-insights"
import type { AgentInsight } from "@/types"
import {
  ShoppingCart,
  TrendingUp,
  Users,
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  FolderKanban,
  DollarSign,
} from "lucide-react"

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

interface ShopifyAnalytics {
  total_revenue: number
  total_orders: number
  aov: number
  unique_customers: number
  total_refunds?: number
  total_discounts?: number
}

interface DailyChartData {
  date: string
  revenue: number
  orders: number
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
  const [shopifyAnalytics, setShopifyAnalytics] = useState<ShopifyAnalytics | null>(null)
  const [chartData, setChartData] = useState<DailyChartData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch lightweight data in parallel
    const [proposalsRes, projectsRes, eventsRes, statsRes] = await Promise.all([
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
      // Use server-side API to avoid fetching 5MB orders blob client-side
      fetch("/api/dashboard/stats").then(r => r.json()).catch(() => null),
    ])

    if (proposalsRes.data) setProposals(proposalsRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)
    if (eventsRes.data) setEvents(eventsRes.data)

    // Process stats from server-side aggregation
    if (statsRes?.analytics) {
      const a = statsRes.analytics
      setShopifyAnalytics({
        total_revenue: a.total_revenue ?? 0,
        total_orders: a.total_orders ?? 0,
        aov: a.aov ?? 0,
        unique_customers: a.unique_customers ?? 0,
        total_refunds: a.total_refunds,
        total_discounts: a.total_discounts,
      })
    }
    if (statsRes?.dailyChart && Array.isArray(statsRes.dailyChart)) {
      setChartData(statsRes.dailyChart)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch("/api/shopify/sync", { method: "POST" })
      if (res.ok) {
        // Refresh data after sync
        await fetchData()
      }
    } catch (err) {
      console.error("Sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }

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
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Data Insights */}
        <DataInsights page="dashboard" />

        {/* KPIs - Shopify real data */}
        {shopifyAnalytics ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KPICard
              label={`CA ${new Date().toLocaleDateString("fr-FR", { month: "long" }).replace(/^\w/, c => c.toUpperCase())}`}
              value={formatCurrency(shopifyAnalytics.total_revenue)}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <KPICard
              label="Commandes"
              value={formatNumber(shopifyAnalytics.total_orders)}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <KPICard
              label="Panier moyen"
              value={formatCurrency(shopifyAnalytics.aov)}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <KPICard
              label="Clients uniques"
              value={formatNumber(shopifyAnalytics.unique_customers)}
              icon={<Users className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
            <p className="text-sm text-zinc-500">
              Aucune donnée Shopify en cache.{" "}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
              >
                Lancer une synchronisation
              </button>{" "}
              pour afficher les KPIs.
            </p>
          </div>
        )}

        {/* Charts + Insights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Évolution du CA</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <LineChart
                  data={chartData}
                  xKey="date"
                  lines={[
                    { key: "revenue", color: "#18181b", name: "CA (€)" },
                    { key: "orders", color: "#a1a1aa", name: "Commandes" },
                  ]}
                  height={280}
                />
              ) : (
                <div className="flex items-center justify-center h-[280px] text-zinc-400 text-sm">
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Chargement...
                    </>
                  ) : (
                    "Aucune donnée de commandes disponible. Lancez une sync Shopify."
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agent Insights -- real data from Supabase */}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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

        {/* Projects Overview -- from Supabase */}
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
