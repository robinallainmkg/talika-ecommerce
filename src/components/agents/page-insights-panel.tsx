"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { AgentInsightCard } from "@/components/ui/agent-insight-card"
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"

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
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const runAnalysis = async () => {
    setAnalyzing(true)
    setError(null)
    setAnalysis(null)

    try {
      const res = await fetch("/api/agents/run-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, pageContext }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'analyse")
        return
      }

      setAnalysis(data.analysis)
      // Refresh insights list
      await fetchInsights()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion")
    } finally {
      setAnalyzing(false)
    }
  }

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
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              runAnalysis()
            }}
            disabled={analyzing}
            className="text-xs"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Analyser
              </>
            )}
          </Button>
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
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {analysis && (
            <div className="rounded-lg bg-white/70 border border-violet-100 p-4">
              <h4 className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">
                Analyse
              </h4>
              <div className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">
                {analysis}
              </div>
            </div>
          )}

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
          ) : !analysis && !analyzing ? (
            <p className="text-sm text-zinc-400 text-center py-4">
              Aucun insight disponible. Cliquez sur &quot;Analyser&quot; pour lancer l&apos;agent IA.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
