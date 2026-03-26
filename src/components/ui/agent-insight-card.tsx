"use client"

import { cn } from "@/lib/utils"
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Zap,
} from "lucide-react"
import type { AgentInsight } from "@/types"

const severityConfig = {
  info: {
    icon: Lightbulb,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconColor: "text-blue-600",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-600",
  },
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconColor: "text-emerald-600",
  },
  critical: {
    icon: AlertCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    iconColor: "text-red-600",
  },
}

interface AgentInsightCardProps {
  insight: AgentInsight
  className?: string
}

export function AgentInsightCard({ insight, className }: AgentInsightCardProps) {
  const config = severityConfig[insight.severity as keyof typeof severityConfig] || severityConfig.info
  const Icon = config.icon

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        config.bg,
        config.border,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", config.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900">
              {insight.title}
            </h4>
            <span className="text-xs text-zinc-400">{insight.category}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">{insight.description}</p>
          {insight.actionable && insight.suggestedAction && (
            <div className="mt-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-zinc-700">
                Action : {insight.suggestedAction}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
