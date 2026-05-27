"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Lightbulb,
  Check,
  X,
  Copy,
  Megaphone,
  Mail,
  ShoppingBag,
  Users,
  Heart,
  Gift,
  Globe,
  HelpCircle,
  Loader2,
  CheckCircle2,
  Filter,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────

interface Opportunity {
  id: string
  title: string
  description: string
  category: string
  impact: string
  prompt: string | null
  status: string
  created_at: string
}

// ─── Constants ──────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: typeof Lightbulb; color: string; label: string }> = {
  meta_ads: { icon: Megaphone, color: "text-blue-600 bg-blue-50 border-blue-200", label: "Meta Ads" },
  klaviyo: { icon: Mail, color: "text-purple-600 bg-purple-50 border-purple-200", label: "Klaviyo" },
  shopify: { icon: ShoppingBag, color: "text-green-600 bg-green-50 border-green-200", label: "Shopify" },
  influence: { icon: Users, color: "text-pink-600 bg-pink-50 border-pink-200", label: "Influence" },
  retention: { icon: Heart, color: "text-red-600 bg-red-50 border-red-200", label: "Retention" },
  generosite: { icon: Gift, color: "text-amber-600 bg-amber-50 border-amber-200", label: "Générosité" },
  google_ads: { icon: Globe, color: "text-cyan-600 bg-cyan-50 border-cyan-200", label: "Google Ads" },
  other: { icon: HelpCircle, color: "text-zinc-600 bg-zinc-50 border-zinc-200", label: "Autre" },
}

const IMPACT_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
}

const IMPACT_LABELS: Record<string, string> = {
  high: "Impact fort",
  medium: "Impact moyen",
  low: "Impact faible",
}

// ─── Page ───────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [showDone, setShowDone] = useState(false)

  const fetchOpportunities = useCallback(async () => {
    setLoading(true)
    try {
      const status = showDone ? "all" : "pending"
      const res = await fetch(`/api/opportunities?status=${status}`)
      const data = await res.json()
      if (Array.isArray(data)) setOpportunities(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [showDone])

  useEffect(() => {
    fetchOpportunities()
  }, [fetchOpportunities])

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      // Remove from list with animation feel
      setOpportunities((prev) => prev.filter((o) => o.id !== id))
    } catch {
      // silent
    }
  }

  const copyPrompt = (id: string, prompt: string) => {
    navigator.clipboard.writeText(prompt)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Get unique categories for filter
  const categories = Array.from(new Set(opportunities.map((o) => o.category)))

  // Filter opportunities
  const filtered = filter === "all"
    ? opportunities
    : opportunities.filter((o) => o.category === filter)

  // Sort: high impact first, then medium, then low
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const sorted = [...filtered].sort((a, b) =>
    (impactOrder[a.impact] ?? 1) - (impactOrder[b.impact] ?? 1)
  )

  const pendingCount = opportunities.filter((o) => o.status === "pending").length

  return (
    <div>
      <Header
        title="Opportunités"
        subtitle={`${pendingCount} action${pendingCount !== 1 ? "s" : ""} identifiée${pendingCount !== 1 ? "s" : ""}`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDone(!showDone)}
          >
            {showDone ? <Filter className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {showDone ? "Masquer terminées" : "Voir terminées"}
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
              filter === "all"
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
            )}
          >
            Tout ({opportunities.length})
          </button>
          {categories.map((cat) => {
            const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other
            const count = opportunities.filter((o) => o.category === cat).length
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  filter === cat
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                )}
              >
                {cfg.label} ({count})
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Chargement...
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-zinc-500 text-lg font-medium">Tout est clean !</p>
            <p className="text-zinc-400 text-sm mt-1">Aucune opportunité en attente.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sorted.map((opp) => {
              const cfg = CATEGORY_CONFIG[opp.category] || CATEGORY_CONFIG.other
              const Icon = cfg.icon
              const isDone = opp.status === "done"
              const isIgnored = opp.status === "ignored"

              return (
                <Card
                  key={opp.id}
                  className={cn(
                    "p-4 transition-all",
                    isDone && "opacity-50",
                    isIgnored && "opacity-30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Category icon */}
                    <div className={cn("flex-shrink-0 p-2 rounded-lg border", cfg.color)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-zinc-900 text-sm">{opp.title}</h3>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          IMPACT_STYLES[opp.impact] || IMPACT_STYLES.medium
                        )}>
                          {IMPACT_LABELS[opp.impact] || opp.impact}
                        </span>
                        {isDone && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            Fait
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-sm leading-relaxed">{opp.description}</p>
                    </div>

                    {/* Actions */}
                    {opp.status === "pending" && (
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {opp.prompt && (
                          <button
                            onClick={() => copyPrompt(opp.id, opp.prompt!)}
                            title="Copier le prompt Claude Code"
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              copiedId === opp.id
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-zinc-900 text-white hover:bg-zinc-800"
                            )}
                          >
                            {copiedId === opp.id ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copié
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Prompt
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(opp.id, "done")}
                          title="Marquer comme fait"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => updateStatus(opp.id, "ignored")}
                          title="Ignorer"
                          className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
