"use client"

import { useState, useEffect, useCallback } from "react"
import { Lightbulb, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"

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
                  <div>
                    <p className={`text-sm font-medium ${config.text}`}>{insight.title}</p>
                    <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{insight.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
