"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { Save, Loader2, Target, TrendingUp, Percent, Gift, CheckCircle, RefreshCw } from "lucide-react"

const MONTHS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]

const GROWTH_TARGET = 1.20 // +20%
const GENEROSITE_TARGET = 20 // 20% (down from 23.75%)

interface GenDetail {
  ca_brut?: number
  dotations?: number
  retours?: number
  codes_influenceurs?: number
  codes_promo?: number
  auto_discounts?: number
  prix_barres?: number
  total?: number
}

interface MonthData {
  month: number
  ca_2025: number
  ca_2026: number
  media_spent: number
  generosite: number
  generosite_detail?: GenDetail
}

function emptyMonthData(): MonthData[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ca_2025: 0,
    ca_2026: 0,
    media_spent: 0,
    generosite: 0,
  }))
}

export default function ObjectivesPage() {
  const [data, setData] = useState<MonthData[]>(emptyMonthData())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [tooltipMonth, setTooltipMonth] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch("/api/objectives/sync", { method: "POST" })
      const json = await res.json()
      if (json.success) {
        setSyncResult(`${json.orders_fetched} commandes (${json.cached_months?.length || 0} mois en cache) — générosité mise à jour`)
        // Re-fetch full data from DB (sync only updates generosite,
        // CA and media_spent are preserved in DB)
        const freshRes = await fetch("/api/objectives")
        const freshJson = await freshRes.json()
        if (freshJson.objectives && freshJson.objectives.length > 0) {
          const merged = emptyMonthData()
          for (const obj of freshJson.objectives) {
            const idx = obj.month - 1
            if (idx >= 0 && idx < 12) {
              merged[idx] = {
                month: obj.month,
                ca_2025: Number(obj.ca_2025) || 0,
                ca_2026: Number(obj.ca_2026) || 0,
                media_spent: Number(obj.media_spent) || 0,
                generosite: Number(obj.generosite) || 0,
                generosite_detail: obj.generosite_detail || undefined,
              }
            }
          }
          setData(merged)
        }
        setTimeout(() => setSyncResult(null), 5000)
      } else {
        setSyncResult(`Erreur: ${json.error}`)
      }
    } catch (err) {
      setSyncResult("Erreur de connexion")
      console.error("Sync failed:", err)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/objectives")
        const json = await res.json()

        if (json.objectives && json.objectives.length > 0) {
          const merged = emptyMonthData()
          for (const obj of json.objectives) {
            const idx = obj.month - 1
            if (idx >= 0 && idx < 12) {
              merged[idx] = {
                month: obj.month,
                ca_2025: Number(obj.ca_2025) || 0,
                ca_2026: Number(obj.ca_2026) || 0,
                media_spent: Number(obj.media_spent) || 0,
                generosite: Number(obj.generosite) || 0,
                generosite_detail: obj.generosite_detail || undefined,
              }
            }
          }
          setData(merged)
        }
      } catch (err) {
        console.error("Failed to load objectives:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: data }),
      })
      const json = await res.json()
      if (json.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (err) {
      console.error("Failed to save:", err)
    } finally {
      setSaving(false)
    }
  }, [data])

  const updateField = (monthIndex: number, field: keyof MonthData, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.,\-]/g, "").replace(",", "."))
    setData((prev) => {
      const next = [...prev]
      next[monthIndex] = { ...next[monthIndex], [field]: isNaN(numValue) ? 0 : numValue }
      return next
    })
  }

  // ---- Computed totals (Year-to-Date only) ----
  // Only count months that have CA 2026 data for a fair YTD comparison
  const ytdMonths = data.filter(r => r.ca_2026 > 0)
  const ytdCA2025 = ytdMonths.reduce((s, r) => s + r.ca_2025, 0)
  const totalCA2026 = ytdMonths.reduce((s, r) => s + r.ca_2026, 0)
  const totalCA2025 = data.reduce((s, r) => s + r.ca_2025, 0)
  const totalTarget2026 = totalCA2025 * GROWTH_TARGET
  const totalMediaSpent = data.reduce((s, r) => s + r.media_spent, 0)

  // YTD growth: compare same months only
  const croissanceActual = ytdCA2025 > 0 ? ((totalCA2026 - ytdCA2025) / ytdCA2025) * 100 : 0
  const mediaPercent = totalCA2026 > 0 ? (totalMediaSpent / totalCA2026) * 100 : 0

  // Weighted average generosite (by CA)
  const weightedGenerosite =
    totalCA2026 > 0
      ? data.reduce((s, r) => s + r.generosite * r.ca_2026, 0) / totalCA2026
      : 0

  const croissanceProgress = Math.min(100, Math.max(0, (croissanceActual / 20) * 100))
  // Progression du CA réalisé (YTD) vers l'objectif annuel total (12 mois = Σ ca_2025 × 1,20)
  const annualProgress =
    totalTarget2026 > 0 ? Math.min(100, Math.max(0, (totalCA2026 / totalTarget2026) * 100)) : 0

  // ---- Status helpers ----
  function growthStatus(croissance: number) {
    if (croissance >= 20) return { icon: "\u2713", color: "text-emerald-600", bg: "bg-emerald-50" }
    if (croissance >= 10) return { icon: "\u26A0", color: "text-amber-500", bg: "bg-amber-50" }
    return { icon: "\u2717", color: "text-red-500", bg: "bg-red-50" }
  }

  function mediaStatus(pct: number) {
    if (pct === 0) return { icon: "\u2014", color: "text-zinc-400", bg: "bg-zinc-50" }
    if (pct <= 25) return { icon: "\u2713", color: "text-emerald-600", bg: "bg-emerald-50" }
    if (pct <= 30) return { icon: "\u26A0", color: "text-amber-500", bg: "bg-amber-50" }
    return { icon: "\u2717", color: "text-red-500", bg: "bg-red-50" }
  }

  function generositeStatus(pct: number) {
    if (pct === 0) return { icon: "\u2014", color: "text-zinc-400", bg: "bg-zinc-50" }
    if (pct <= 20) return { icon: "\u2713", color: "text-emerald-600", bg: "bg-emerald-50" }
    if (pct <= 23) return { icon: "\u26A0", color: "text-amber-500", bg: "bg-amber-50" }
    return { icon: "\u2717", color: "text-red-500", bg: "bg-red-50" }
  }

  // Statut d\u00E9taill\u00E9 par crit\u00E8re : une pastille par crit\u00E8re (CA, Media, G\u00E9n\u00E9rosit\u00E9).
  // Mois non rempli (pas de CA 2026) \u2192 pas de statut, on affiche "\u2014".
  const DOT_COLORS: Record<string, string> = {
    "\u2713": "bg-emerald-500",
    "\u26A0": "bg-amber-400",
    "\u2717": "bg-red-500",
    "\u2014": "bg-zinc-200",
  }

  function rowStatus(row: MonthData) {
    if (row.ca_2026 === 0) return null

    const croissance = row.ca_2025 > 0 ? ((row.ca_2026 - row.ca_2025) / row.ca_2025) * 100 : 0
    const mediaPct = (row.media_spent / row.ca_2026) * 100

    const gs = growthStatus(croissance)
    const ms = mediaStatus(mediaPct)
    const gens = generositeStatus(row.generosite)

    const fmtSign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
    return {
      dots: [
        { key: "CA", icon: gs.icon, label: `Croissance ${fmtSign(croissance)} (cible +20%)` },
        { key: "Media", icon: ms.icon, label: `Media ${mediaPct.toFixed(1)}% du CA (cible \u226425%)` },
        { key: "G\u00E9n\u00E9", icon: gens.icon, label: `G\u00E9n\u00E9rosit\u00E9 ${row.generosite}% (cible \u226420%)` },
      ],
      title: [
        `Croissance ${fmtSign(croissance)} ${gs.icon}`,
        `Media ${mediaPct.toFixed(1)}% ${ms.icon}`,
        `G\u00E9n\u00E9rosit\u00E9 ${row.generosite}% ${gens.icon}`,
      ].join("\n"),
    }
  }

  return (
    <div>
      <Header
        title="Objectifs 2026"
        subtitle="Suivi des objectifs annuels Talika Paris"
        actions={
          <div className="flex items-center gap-2">
            {syncResult && (
              <span className="text-xs text-emerald-600 font-medium max-w-[200px] truncate">
                {syncResult}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sync...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync Shopify
                </>
              )}
            </Button>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                <CheckCircle className="h-4 w-4" />
                Sauvegarde
              </span>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sauvegarde...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {/* ── KPI Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Croissance CA */}
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-500">Chiffre d&apos;affaires</span>
                    <span className="text-zinc-400">
                      <TrendingUp className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-900">
                    {croissanceActual >= 0 ? "+" : ""}{croissanceActual.toFixed(1)}%
                  </div>
                  <div className="flex items-center justify-between mt-1 mb-2">
                    <span className="text-xs text-zinc-400">YTD ({ytdMonths.length} mois) vs 2025</span>
                    <Badge variant={croissanceActual >= 20 ? "success" : croissanceActual >= 10 ? "warning" : "danger"}>
                      {croissanceActual >= 20 ? "Atteint" : "En cours"}
                    </Badge>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, croissanceProgress))}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-zinc-400">{formatCurrency(totalCA2026)} (YTD)</span>
                    <span className="text-xs text-zinc-400">vs {formatCurrency(ytdCA2025)} en 2025</span>
                  </div>

                  {/* Progression vers l'objectif annuel (12 mois) */}
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-zinc-400">Objectif annuel (12 mois)</span>
                      <span className="text-xs font-semibold text-zinc-600">{annualProgress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${annualProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-zinc-400">{formatCurrency(totalCA2026)} réalisés</span>
                      <span className="text-xs text-zinc-400">sur {formatCurrency(totalTarget2026)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Media Spent */}
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-500">Media Spent</span>
                    <span className="text-zinc-400">
                      <Percent className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-900">
                    {mediaPercent.toFixed(1)}%
                  </div>
                  <div className="flex items-center justify-between mt-1 mb-2">
                    <span className="text-xs text-zinc-400">Objectif : &le;25% du CA</span>
                    <Badge variant={mediaPercent <= 25 ? "success" : mediaPercent <= 30 ? "warning" : "danger"}>
                      {mediaPercent <= 25 ? "OK" : "Attention"}
                    </Badge>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        mediaPercent <= 25 ? "bg-emerald-500" : mediaPercent <= 30 ? "bg-amber-400" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, (mediaPercent / 40) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-zinc-400">{formatCurrency(totalMediaSpent)}</span>
                    <span className="text-xs text-zinc-400">sur {formatCurrency(totalCA2026)} CA</span>
                  </div>
                </CardContent>
              </Card>

              {/* Generosite */}
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-500">Generosite</span>
                    <span className="text-zinc-400">
                      <Gift className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-900">
                    {weightedGenerosite.toFixed(1)}%
                  </div>
                  <div className="flex items-center justify-between mt-1 mb-2">
                    <span className="text-xs text-zinc-400">Objectif : 20% (vs 23.75% en 2025)</span>
                    <Badge variant={weightedGenerosite <= 20 ? "success" : weightedGenerosite <= 23 ? "warning" : "danger"}>
                      {weightedGenerosite <= 20 ? "OK" : "A reduire"}
                    </Badge>
                  </div>
                  <div className="w-full bg-zinc-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        weightedGenerosite <= 20 ? "bg-emerald-500" : weightedGenerosite <= 23 ? "bg-amber-400" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, (weightedGenerosite / GENEROSITE_TARGET) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-zinc-400">Taux moyen pondere</span>
                    <span className="text-xs text-zinc-400">Cible : 20%</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Monthly Tracking Table ─────────────────────── */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-zinc-500" />
                    Suivi mensuel
                  </div>
                </CardTitle>
                <Badge variant="info">12 mois</Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-zinc-300">
                        <th className="pb-3 text-left font-medium text-zinc-500 sticky left-0 bg-white min-w-[110px] z-10">
                          Mois
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[120px]">
                          CA 2025 HT
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[120px]">
                          Target 2026
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[120px]">
                          CA 2026 HT
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                          Croissance
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[120px]">
                          Media Spent
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                          % Media/CA
                        </th>
                        <th className="pb-3 text-right font-medium text-zinc-500 min-w-[90px]">
                          Generosite %
                        </th>
                        <th className="pb-3 text-center font-medium text-zinc-500 min-w-[50px]">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => {
                        const target2026 = row.ca_2025 * GROWTH_TARGET
                        const croissance =
                          row.ca_2025 > 0
                            ? ((row.ca_2026 - row.ca_2025) / row.ca_2025) * 100
                            : 0
                        const mediaPct =
                          row.ca_2026 > 0
                            ? (row.media_spent / row.ca_2026) * 100
                            : 0
                        const status = rowStatus(row)

                        return (
                          <tr
                            key={row.month}
                            className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                          >
                            {/* Mois */}
                            <td className="py-2.5 px-1 font-medium text-zinc-700 sticky left-0 bg-white z-10">
                              {MONTHS_FR[idx]}
                            </td>

                            {/* CA 2025 TTC */}
                            <td className="py-2.5 text-right">
                              <input
                                type="text"
                                className="w-full text-right text-sm border-2 border-zinc-200 rounded-md bg-white text-zinc-700 focus:border-zinc-900 focus:ring-0 focus:outline-none px-2 py-1"
                                value={row.ca_2025 ? Math.round(row.ca_2025) : ""}
                                placeholder="0"
                                onChange={(e) => updateField(idx, "ca_2025", e.target.value)}
                              />
                            </td>

                            {/* Target 2026 (auto) */}
                            <td className="py-2.5 text-right text-zinc-500 font-medium px-2">
                              {row.ca_2025 > 0 ? formatCurrency(target2026) : "\u2014"}
                            </td>

                            {/* CA 2026 TTC */}
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="text"
                                  className="w-full text-right text-sm border-2 border-zinc-200 rounded-md bg-white text-zinc-700 focus:border-zinc-900 focus:ring-0 focus:outline-none px-2 py-1"
                                  value={row.ca_2026 ? Math.round(row.ca_2026) : ""}
                                  placeholder="0"
                                  onChange={(e) => updateField(idx, "ca_2026", e.target.value)}
                                />
                              </div>
                            </td>

                            {/* Croissance % */}
                            <td className="py-2.5 text-right px-2">
                              {row.ca_2025 > 0 && row.ca_2026 > 0 ? (
                                <span
                                  className={`font-medium ${
                                    croissance >= 20
                                      ? "text-emerald-600"
                                      : croissance >= 0
                                      ? "text-amber-500"
                                      : "text-red-500"
                                  }`}
                                >
                                  {croissance >= 0 ? "+" : ""}
                                  {croissance.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-zinc-300">{"\u2014"}</span>
                              )}
                            </td>

                            {/* Media Spent */}
                            <td className="py-2.5 text-right">
                              <input
                                type="text"
                                className="w-full text-right text-sm border-2 border-zinc-200 rounded-md bg-white text-zinc-700 focus:border-zinc-900 focus:ring-0 focus:outline-none px-2 py-1"
                                value={row.media_spent ? Math.round(row.media_spent) : ""}
                                placeholder="0"
                                onChange={(e) => updateField(idx, "media_spent", e.target.value)}
                              />
                            </td>

                            {/* % Media/CA */}
                            <td className="py-2.5 text-right px-2">
                              {row.ca_2026 > 0 && row.media_spent > 0 ? (
                                <span
                                  className={`font-medium ${
                                    mediaPct <= 25
                                      ? "text-emerald-600"
                                      : mediaPct <= 30
                                      ? "text-amber-500"
                                      : "text-red-500"
                                  }`}
                                >
                                  {mediaPct.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-zinc-300">{"\u2014"}</span>
                              )}
                            </td>

                            {/* Generosite % with hover breakdown */}
                            <td className="py-2.5 text-right">
                              <div
                                className="w-full"
                                onMouseEnter={(e) => {
                                  if (row.generosite_detail && row.generosite_detail.total) {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setTooltipPos({ x: rect.right, y: rect.top })
                                    setTooltipMonth(row.month)
                                  }
                                }}
                                onMouseLeave={() => setTooltipMonth(null)}
                              >
                                <input
                                  type="text"
                                  className={`w-full text-right text-sm border-2 rounded-md bg-white text-zinc-700 focus:border-zinc-900 focus:ring-0 focus:outline-none px-2 py-1 ${
                                    row.generosite_detail && row.generosite_detail.total
                                      ? "border-zinc-200 cursor-help"
                                      : "border-zinc-200"
                                  }`}
                                  value={row.generosite || ""}
                                  placeholder="0"
                                  onChange={(e) => updateField(idx, "generosite", e.target.value)}
                                />
                              </div>
                            </td>

                            {/* Status : 3 pastilles CA / Media / Générosité */}
                            <td className="py-2.5 text-center">
                              {status ? (
                                <div
                                  className="inline-flex items-center gap-1 cursor-help"
                                  title={status.title}
                                >
                                  {status.dots.map((d) => (
                                    <span
                                      key={d.key}
                                      aria-label={d.label}
                                      className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[d.icon] || "bg-zinc-200"}`}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-300">{"—"}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}

                      {/* ── Totals row ── */}
                      <tr className="border-t-2 border-zinc-300 bg-zinc-900 text-white">
                        <td className="py-3 px-1 font-bold sticky left-0 bg-zinc-900 z-10">
                          TOTAL
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {formatCurrency(totalCA2025)}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {formatCurrency(totalTarget2026)}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {formatCurrency(totalCA2026)}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {totalCA2025 > 0
                            ? `${croissanceActual >= 0 ? "+" : ""}${croissanceActual.toFixed(1)}%`
                            : "\u2014"}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {formatCurrency(totalMediaSpent)}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {totalCA2026 > 0 ? `${mediaPercent.toFixed(1)}%` : "\u2014"}
                        </td>
                        <td className="py-3 text-right font-bold px-2">
                          {weightedGenerosite > 0 ? `${weightedGenerosite.toFixed(1)}%` : "\u2014"}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`text-lg font-bold ${
                            croissanceActual >= 20 && mediaPercent <= 25 && weightedGenerosite <= 20
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}>
                            {croissanceActual >= 20 && mediaPercent <= 25 && weightedGenerosite <= 20
                              ? "\u2713"
                              : "\u26A0"}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── Legend ─────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Statut :</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-400" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-300" />
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <span>= Croissance \u00B7 Media \u00B7 G\u00E9n\u00E9rosit\u00E9 (survoler pour le d\u00E9tail)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Objectif atteint
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                Attention
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                Hors objectif
              </div>
              <div className="ml-auto text-zinc-400">
                CA &amp; Media : saisie manuelle (compta, HT = Choose + Shopify + Amazon). Generosite : calculee automatiquement depuis Shopify.
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Fixed tooltip for generosity breakdown ── */}
      {tooltipMonth !== null && (() => {
        const row = data.find((r) => r.month === tooltipMonth)
        const d = row?.generosite_detail
        if (!d || !d.total) return null
        const t = d.total
        const caBrut = d.ca_brut || 1
        const lines: { label: string; amount: number; bg: string }[] = []
        if (d.dotations) lines.push({ label: "Dotations (MKG)", amount: d.dotations, bg: "bg-purple-400" })
        if (d.codes_influenceurs) lines.push({ label: "Codes influenceurs", amount: d.codes_influenceurs, bg: "bg-blue-400" })
        if (d.codes_promo) lines.push({ label: "Codes promo", amount: d.codes_promo, bg: "bg-amber-400" })
        if (d.auto_discounts) lines.push({ label: "Auto discounts", amount: d.auto_discounts, bg: "bg-cyan-400" })
        if (d.prix_barres) lines.push({ label: "Prix barres", amount: d.prix_barres, bg: "bg-pink-400" })
        const retours = d.retours || 0
        return (
          <div
            className="fixed z-[9999] w-72 bg-zinc-900 text-white text-xs rounded-lg shadow-2xl p-3 pointer-events-none"
            style={{ top: tooltipPos.y - 8, left: tooltipPos.x - 288, transform: "translateY(-100%)" }}
          >
            <div className="font-semibold mb-2 text-zinc-300 flex justify-between">
              <span>{MONTHS_FR[tooltipMonth - 1]} — {row?.generosite}%</span>
              <span className="text-zinc-500">{formatCurrency(d.ca_brut || 0)} brut</span>
            </div>
            <div className="space-y-1.5">
              {lines.map((l) => {
                const pctOfCaBrut = caBrut > 0 ? (l.amount / caBrut * 100) : 0
                return (
                  <div key={l.label} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${l.bg}`} />
                      <span>{l.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400">{formatCurrency(l.amount)}</span>
                      <span className="font-medium w-12 text-right">{pctOfCaBrut.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Mini bar chart */}
            <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-zinc-700">
              {lines.map((l) => (
                <div
                  key={l.label}
                  className={`${l.bg} h-full`}
                  style={{ width: `${(l.amount / t) * 100}%` }}
                />
              ))}
            </div>
            {retours > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-700 flex items-center justify-between text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-zinc-600" />
                  <span>Retours (SAV) — exclu</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{formatCurrency(retours)}</span>
                  <span className="w-12 text-right">{(retours / caBrut * 100).toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
