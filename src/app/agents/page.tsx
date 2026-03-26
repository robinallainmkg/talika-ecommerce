"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { KPICard } from "@/components/ui/kpi-card"
import {
  Bot,
  Play,
  Globe,
  ShoppingCart,
  Megaphone,
  Mail,
  Calendar,
  FolderKanban,
  Brain,
  Clock,
  CheckCircle,
  XCircle,

  Loader2,
  RefreshCw,
  ListChecks,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Agent {
  id: string
  slug: string
  name: string
  description: string
  is_active: boolean
}

interface AgentRun {
  id: string
  agent_id: string
  status: "running" | "completed" | "error"
  started_at: string
  completed_at: string | null
  result_summary: string | null
}

interface Proposal {
  id: string
  agent_id: string
  title: string
  description: string
  priority: "low" | "medium" | "high" | "critical"
  category: string
  status: "pending" | "approved" | "rejected"
}

// ---------------------------------------------------------------------------
// Agent metadata (local – capabilities & icons)
// ---------------------------------------------------------------------------

const AGENT_META: Record<string, { capabilities: string[]; icon: string }> = {
  traffic: { capabilities: ["Analytics", "SEO", "Sources", "Conversion"], icon: "Globe" },
  sales: { capabilities: ["Revenue", "Produits", "Segments", "AOV"], icon: "ShoppingCart" },
  meta_ads: { capabilities: ["Campagnes", "ROAS", "Ciblage", "Budgets"], icon: "Megaphone" },
  klaviyo: { capabilities: ["Flows", "Newsletters", "A/B Tests", "Segments"], icon: "Mail" },
  communication: { capabilities: ["Planning", "Cross-canal", "Calendrier"], icon: "Calendar" },
  projects: { capabilities: ["Suivi", "Blocages", "Priorités"], icon: "Kanban" },
  coaching: { capabilities: ["Optimisation", "Prompts", "Qualité"], icon: "Brain" },
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  ShoppingCart,
  Megaphone,
  Mail,
  Calendar,
  Kanban: FolderKanban,
  Brain,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunStatus = "idle" | "running" | "completed" | "error"

const statusConfig: Record<
  RunStatus,
  { label: string; variant: "default" | "success" | "info" | "warning" | "danger" }
> = {
  idle: { label: "En attente", variant: "default" },
  running: { label: "En cours", variant: "info" },
  completed: { label: "Terminé", variant: "success" },
  error: { label: "Erreur", variant: "danger" },
}

const priorityVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "info",
  high: "warning",
  critical: "danger",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function latestRunFor(agentId: string, runs: AgentRun[]): AgentRun | undefined {
  return runs
    .filter((r) => r.agent_id === agentId)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
}

function agentStatus(agentId: string, runs: AgentRun[]): RunStatus {
  const latest = latestRunFor(agentId, runs)
  if (!latest) return "idle"
  return latest.status as RunStatus
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState<string | null>(null)

  // --- Fetch data -----------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/agents")
      if (!res.ok) throw new Error("Erreur de chargement")
      const data = await res.json()
      setAgents(data.agents ?? [])
      setRuns(data.runs ?? [])
      setProposals(data.proposals ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // --- Actions --------------------------------------------------------------

  const runAgent = async (agentId: string) => {
    try {
      setRunningAction(agentId)
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setRunningAction(null)
    }
  }

  const handleProposal = async (proposalId: string, status: "approved" | "rejected") => {
    try {
      await fetch("/api/agents/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, status }),
      })
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status } : p))
      )
    } catch (err) {
      console.error(err)
    }
  }

  // --- Derived data ---------------------------------------------------------

  const pendingProposals = proposals.filter((p) => p.status === "pending")
  const activeAgents = agents.filter((a) => a.is_active)
  const runsToday = runs.filter((r) => isToday(r.started_at))
  const recentRuns = [...runs]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 20)

  const agentNameMap = Object.fromEntries(agents.map((a) => [a.id, a.name]))

  // --- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Gestion des Agents"
        subtitle="Supervision, configuration et lancement des agents IA"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
              Rafraîchir
            </Button>
            <Button
              size="sm"
              onClick={() => runAgent("all")}
              disabled={runningAction !== null}
            >
              {runningAction === "all" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Lancer tous les agents
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
        {/* ---- KPI Summary ---- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KPICard
            label="Agents actifs"
            value={`${activeAgents.length} / ${agents.length}`}
            icon={<Bot className="h-5 w-5" />}
          />
          <KPICard
            label="Runs aujourd'hui"
            value={runsToday.length}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICard
            label="Propositions en attente"
            value={pendingProposals.length}
            icon={<ListChecks className="h-5 w-5" />}
          />
        </div>

        {/* ---- Agent Grid ---- */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Agents</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {agents.map((agent) => {
              const meta = AGENT_META[agent.slug] ?? {
                capabilities: [],
                icon: "Bot",
              }
              const IconComp = ICON_MAP[meta.icon] ?? Bot
              const status = agentStatus(agent.id, runs)
              const statusCfg = statusConfig[status]
              const latest = latestRunFor(agent.id, runs)
              const pendingCount = proposals.filter(
                (p) => p.agent_id === agent.id && p.status === "pending"
              ).length
              const isRunning = runningAction === agent.id

              return (
                <Card key={agent.id}>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-lg p-2 ${
                            status === "running" ? "bg-blue-100" : "bg-zinc-100"
                          }`}
                        >
                          <IconComp
                            className={`h-5 w-5 ${
                              status === "running"
                                ? "text-blue-600 animate-pulse"
                                : "text-zinc-600"
                            }`}
                          />
                        </div>
                        <div>
                          <CardTitle className="text-base">{agent.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant={statusCfg.variant}>
                              {status === "running" && (
                                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              )}
                              {statusCfg.label}
                            </Badge>
                            {latest && (
                              <span className="text-xs text-zinc-400">
                                {formatDate(latest.started_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pendingCount > 0 && (
                          <Badge variant="warning">{pendingCount} en attente</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => runAgent(agent.id)}
                          disabled={runningAction !== null}
                        >
                          {isRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          Lancer
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-500 mb-3">{agent.description}</p>

                    {/* Capabilities */}
                    {meta.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {meta.capabilities.map((cap) => (
                          <Badge key={cap} variant="default">
                            {cap}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* ---- Propositions en attente ---- */}
        {pendingProposals.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              Propositions en attente ({pendingProposals.length})
            </h2>
            <div className="space-y-3">
              {pendingProposals.map((proposal) => (
                <Card key={proposal.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-zinc-400">
                            {agentNameMap[proposal.agent_id] ?? "Agent"}
                          </span>
                          <Badge variant={priorityVariant[proposal.priority] ?? "default"}>
                            {proposal.priority}
                          </Badge>
                          {proposal.category && (
                            <Badge variant="info">{proposal.category}</Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-zinc-900 text-sm">
                          {proposal.title}
                        </h3>
                        <p className="text-sm text-zinc-500 mt-0.5 line-clamp-2">
                          {proposal.description}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handleProposal(proposal.id, "approved")}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleProposal(proposal.id, "rejected")}
                        >
                          <XCircle className="h-4 w-4" />
                          Rejeter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ---- Historique des runs ---- */}
        {recentRuns.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              Historique des runs
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                        <th className="px-4 py-3 font-medium">Agent</th>
                        <th className="px-4 py-3 font-medium">Statut</th>
                        <th className="px-4 py-3 font-medium">Démarré</th>
                        <th className="px-4 py-3 font-medium">Terminé</th>
                        <th className="px-4 py-3 font-medium">Résumé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRuns.map((run) => {
                        const runStatusCfg = statusConfig[run.status as RunStatus] ?? statusConfig.idle
                        return (
                          <tr
                            key={run.id}
                            className="border-b border-zinc-50 last:border-0"
                          >
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              {agentNameMap[run.agent_id] ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={runStatusCfg.variant}>
                                {runStatusCfg.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-zinc-500">
                              {formatDate(run.started_at)}
                            </td>
                            <td className="px-4 py-3 text-zinc-500">
                              {run.completed_at ? formatDate(run.completed_at) : "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                              {run.result_summary ?? "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
