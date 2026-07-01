"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Lightbulb, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react"
import { buildFullPrompt } from "@/lib/claude-prompt"

interface Insight {
  id: string
  title: string
  description: string
  severity: "info" | "warning" | "success" | "critical"
  category: string
  page: string
}

const severityConfig = {
  info: { icon: Lightbulb, bg: "bg-blue-50 border-blue-200", text: "text-blue-700", iconColor: "text-blue-500" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50 border-amber-200", text: "text-amber-700", iconColor: "text-amber-500" },
  success: { icon: CheckCircle2, bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", iconColor: "text-emerald-500" },
  critical: { icon: AlertTriangle, bg: "bg-red-50 border-red-200", text: "text-red-700", iconColor: "text-red-500" },
}

export function DataInsights({ page }: { page: string }) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const contextRef = useRef<string | null>(null)

  // Copie un "prompt dossier" pour Claude Code : contexte business live +
  // l'insight comme mission (même mécanique que /opportunities).
  const copyInsightPrompt = async (insight: Insight) => {
    if (contextRef.current === null) {
      try {
        const res = await fetch("/api/context")
        contextRef.current = res.ok ? await res.text() : ""
      } catch {
        contextRef.current = ""
      }
    }
    const mission = `Insight détecté par le companion sur la page "${insight.page}" (sévérité ${insight.severity}) : « ${insight.title} » — ${insight.description}\n\nAnalyse ce signal en profondeur : vérifie les chiffres sous-jacents dans la data, explique la cause racine, et propose un plan d'action chiffré.`
    navigator.clipboard.writeText(buildFullPrompt(mission, contextRef.current || null))
    setCopiedId(insight.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch(`/api/insights?page=${page}`)
      if (res.ok) {
        const data = await res.json()
        setInsights(data.insights || [])
      }
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  if (loading || insights.length === 0) return null

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-amber-50/30 to-blue-50/30 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-white/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-800">Insights</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {insights.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </div>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {insights.map((insight) => {
            const config = severityConfig[insight.severity] || severityConfig.info
            const Icon = config.icon
            return (
              <div
                key={insight.id}
                className={`rounded-lg border p-3 ${config.bg}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${config.text}`}>{insight.title}</p>
                    <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{insight.description}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyInsightPrompt(insight)
                    }}
                    title="Copier le prompt Claude Code (avec contexte business)"
                    className="flex-shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white/70 transition-colors"
                  >
                    {copiedId === insight.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
