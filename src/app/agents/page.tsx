"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { mockInsights } from "@/lib/mock-data"
import type { AgentType, AgentStatus } from "@/types"
import {
  Bot,
  Play,
  Pause,
  RotateCcw,
  Globe,
  ShoppingCart,
  Megaphone,
  Mail,
  Calendar,
  FolderKanban,
  Brain,
  Zap,
} from "lucide-react"

interface AgentConfig {
  type: AgentType
  name: string
  description: string
  icon: typeof Bot
  status: AgentStatus
  lastRun?: string
  tokensUsed?: number
  insightsCount: number
  capabilities: string[]
}

const agents: AgentConfig[] = [
  {
    type: "traffic",
    name: "Agent Traffic",
    description:
      "Analyse les métriques de trafic, identifie les tendances et propose des améliorations SEO, contenu et campagnes.",
    icon: Globe,
    status: "completed",
    lastRun: "Il y a 2h",
    tokensUsed: 12500,
    insightsCount: 3,
    capabilities: [
      "Analyse des sources de trafic",
      "Détection de tendances",
      "Suggestions SEO",
      "Idées de contenu",
      "Recommandations produit",
    ],
  },
  {
    type: "sales",
    name: "Agent Ventes",
    description:
      "Analyse les performances produits, segments clients, et propose des optimisations de conversion.",
    icon: ShoppingCart,
    status: "completed",
    lastRun: "Il y a 1h",
    tokensUsed: 15200,
    insightsCount: 4,
    capabilities: [
      "Top produits & bundles",
      "Segmentation clients",
      "Analyse de conversion",
      "Prédiction de tendances",
      "Suggestions cross-sell",
    ],
  },
  {
    type: "ads",
    name: "Agent Meta Ads",
    description:
      "Analyse les campagnes Meta, optimise les budgets, ciblages et créatives. Détecte les campagnes sous-performantes.",
    icon: Megaphone,
    status: "completed",
    lastRun: "Il y a 3h",
    tokensUsed: 18700,
    insightsCount: 2,
    capabilities: [
      "Audit de campagnes",
      "Optimisation budget",
      "Suggestions ciblage",
      "Analyse créatives",
      "Recommandations placements & formats",
    ],
  },
  {
    type: "klaviyo",
    name: "Agent Klaviyo",
    description:
      "Analyse les flows et newsletters, propose des A/B tests, nouveaux flows et optimisations d'engagement.",
    icon: Mail,
    status: "running",
    tokensUsed: 8900,
    insightsCount: 5,
    capabilities: [
      "Audit des flows",
      "Propositions de flows",
      "Thèmes de newsletters",
      "A/B tests sujets",
      "Plans de rafraîchissement",
    ],
  },
  {
    type: "communication",
    name: "Agent Communication",
    description:
      "Gère le calendrier de communication, synchronise avec les autres agents pour coordonner les actions.",
    icon: Calendar,
    status: "idle",
    insightsCount: 0,
    capabilities: [
      "Planification campagnes",
      "Coordination inter-agents",
      "Suggestions de timing",
      "Suivi NPD",
    ],
  },
  {
    type: "projects",
    name: "Agent Projets",
    description:
      "Suit l'avancement des projets, identifie les blocages et propose des priorités.",
    icon: FolderKanban,
    status: "idle",
    insightsCount: 0,
    capabilities: [
      "Suivi d'avancement",
      "Détection de risques",
      "Suggestions de priorités",
      "Reporting automatique",
    ],
  },
  {
    type: "coach",
    name: "Agent Coach",
    description:
      "Supervise les autres agents, optimise leurs prompts, processus et consommation de tokens.",
    icon: Brain,
    status: "idle",
    insightsCount: 0,
    capabilities: [
      "Optimisation de prompts",
      "Suivi consommation tokens",
      "Amélioration des processus",
      "Coordination inter-agents",
      "Audit qualité des insights",
    ],
  },
]

const statusConfig: Record<AgentStatus, { label: string; variant: "default" | "success" | "info" | "warning" }> = {
  idle: { label: "En attente", variant: "default" },
  running: { label: "En cours", variant: "info" },
  completed: { label: "Terminé", variant: "success" },
  error: { label: "Erreur", variant: "warning" },
}

export default function AgentsPage() {
  const [agentStates, setAgentStates] = useState(agents)

  const totalTokens = agentStates.reduce((s, a) => s + (a.tokensUsed || 0), 0)
  const totalInsights = agentStates.reduce((s, a) => s + a.insightsCount, 0)
  const runningCount = agentStates.filter((a) => a.status === "running").length

  const toggleAgent = (type: AgentType) => {
    setAgentStates((prev) =>
      prev.map((a) =>
        a.type === type
          ? {
              ...a,
              status: a.status === "running" ? "idle" : "running",
            }
          : a
      )
    )
  }

  const runAll = () => {
    setAgentStates((prev) =>
      prev.map((a) => ({ ...a, status: "running" as AgentStatus }))
    )
  }

  return (
    <div>
      <Header
        title="Gestion des Agents"
        subtitle="Supervision, configuration et optimisation des agents IA"
        actions={
          <Button size="sm" onClick={runAll}>
            <Play className="h-4 w-4" />
            Lancer tous les agents
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-zinc-100 p-2.5">
                <Bot className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Agents actifs</div>
                <div className="text-xl font-bold">{runningCount} / {agents.length}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-zinc-100 p-2.5">
                <Zap className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Tokens utilisés (24h)</div>
                <div className="text-xl font-bold">{totalTokens.toLocaleString("fr-FR")}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-zinc-100 p-2.5">
                <Brain className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <div className="text-sm text-zinc-500">Insights générés (24h)</div>
                <div className="text-xl font-bold">{totalInsights}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {agentStates.map((agent) => {
            const Icon = agent.icon
            const status = statusConfig[agent.status]
            const agentInsights = mockInsights.filter(
              (i) => i.agentType === agent.type
            )

            return (
              <Card key={agent.type}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-lg p-2 ${
                          agent.status === "running"
                            ? "bg-blue-100"
                            : "bg-zinc-100"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            agent.status === "running"
                              ? "text-blue-600 animate-pulse"
                              : "text-zinc-600"
                          }`}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={status.variant}>
                            {agent.status === "running" && (
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                            )}
                            {status.label}
                          </Badge>
                          {agent.lastRun && (
                            <span className="text-xs text-zinc-400">
                              {agent.lastRun}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAgent(agent.type)}
                      >
                        {agent.status === "running" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-500 mb-3">{agent.description}</p>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {agent.capabilities.map((cap) => (
                      <Badge key={cap} variant="default">
                        {cap}
                      </Badge>
                    ))}
                  </div>

                  {/* Stats */}
                  {agent.tokensUsed !== undefined && (
                    <div className="flex gap-4 text-xs text-zinc-400 border-t border-zinc-100 pt-3">
                      <span>{agent.tokensUsed.toLocaleString("fr-FR")} tokens</span>
                      <span>{agent.insightsCount} insights</span>
                    </div>
                  )}

                  {/* Recent insights */}
                  {agentInsights.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {agentInsights.slice(0, 2).map((insight) => (
                        <AgentInsightCard key={insight.id} insight={insight} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
