"use client"

import { useState, useEffect, useCallback } from "react"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react"

interface Proposal {
  id: string
  title: string
  description: string
  category: string
  priority: string
  severity: string
  status: string
  created_at: string
  page_context?: string
}

interface PageInsightsPanelProps {
  agentId: string
  pageContext: string
  title?: string
  maxInsights?: number
}

export function PageInsightsPanel({
  agentId,
  pageContext,
  title = "Insights IA",
  maxInsights = 5,
}: PageInsightsPanelProps) {
  const [insights, setInsights] = useState<Proposal[]>([])
  const [expanded, setExpanded] = useState(true)

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/proposals?page_context=${pageContext}&limit=${maxInsights}`)
      if (res.ok) {
        const data = await res.json()
        setInsights(data.proposals || [])
      }
    } catch {
      // Silent fail on fetch
    }
  }, [pageContext, maxInsights])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-violet-50/50 to-blue-50/50 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-white/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
          {insights.length > 0 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
              {insights.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          {insights.length > 0 ? (
            <div className="space-y-2">
              {insights.map((insight) => (
                <AgentInsightCard
                  key={insight.id}
                  insight={{
                    id: insight.id,
                    agentType: agentId as any,
                    title: insight.title,
                    description: insight.description,
                    severity: (insight.severity || "info") as any,
                    category: insight.category,
                    actionable: insight.priority === "high" || insight.priority === "critical",
                    suggestedAction: insight.priority === "critical" ? "Action immédiate requise" : undefined,
                    createdAt: insight.created_at,
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400 text-center py-4">
              Aucun insight disponible.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
