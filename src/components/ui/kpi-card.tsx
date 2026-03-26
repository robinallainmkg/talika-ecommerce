"use client"

import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface KPICardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  className?: string
}

export function KPICard({
  label,
  value,
  change,
  changeLabel,
  icon,
  className,
}: KPICardProps) {
  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const isNeutral = change === undefined || change === 0

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-medium text-zinc-500 truncate">{label}</span>
        {icon && <span className="text-zinc-400 hidden sm:block">{icon}</span>}
      </div>
      <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold text-zinc-900 truncate">{value}</div>
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1">
          {isPositive && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
          {isNegative && <TrendingDown className="h-3.5 w-3.5 text-red-600" />}
          {isNeutral && <Minus className="h-3.5 w-3.5 text-zinc-400" />}
          <span
            className={cn(
              "text-sm font-medium",
              isPositive && "text-emerald-600",
              isNegative && "text-red-600",
              isNeutral && "text-zinc-400"
            )}
          >
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-zinc-400">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
