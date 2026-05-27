"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────
interface PnLLine {
  id: string
  category: string
  subcategory: string
  month: number
  year: number
  amount: number
  source: string
  sort_order: number
}

interface SubcategoryRow {
  category: string
  subcategory: string
  sort_order: number
  source: string
  months: Record<number, { id: string; amount: number }>
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]

const CATEGORY_ORDER = ["Chiffre d'affaires", "Coûts des ventes", "Marketing", "Opérations"]
const CATEGORY_STYLE: Record<string, { bg: string; text: string; sign: 1 | -1 }> = {
  "Chiffre d'affaires": { bg: "bg-emerald-50", text: "text-emerald-900", sign: 1 },
  "Coûts des ventes": { bg: "bg-red-50", text: "text-red-900", sign: -1 },
  Marketing: { bg: "bg-amber-50", text: "text-amber-900", sign: -1 },
  Opérations: { bg: "bg-blue-50", text: "text-blue-900", sign: -1 },
}

// ─── Page ─────────────────────────────────────────────────────────
export default function PnLPage() {
  const [lines, setLines] = useState<PnLLine[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRow, setNewRow] = useState({ category: "Chiffre d'affaires", subcategory: "" })
  const [saving, setSaving] = useState(false)

  // ─── Load data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pnl?year=${year}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setLines(json.lines || [])
    } catch {
      setLines([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Build row structure ──────────────────────────────────────
  const rowMap = new Map<string, SubcategoryRow>()
  lines.forEach((l) => {
    const key = `${l.category}|||${l.subcategory}`
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        category: l.category,
        subcategory: l.subcategory,
        sort_order: l.sort_order,
        source: l.source,
        months: {},
      })
    }
    rowMap.get(key)!.months[l.month] = { id: l.id, amount: l.amount }
  })

  const allRows = Array.from(rowMap.values()).sort((a, b) => a.sort_order - b.sort_order)

  // Group by category
  const categories = CATEGORY_ORDER.filter((c) => allRows.some((r) => r.category === c))
  // Also include any categories not in CATEGORY_ORDER
  allRows.forEach((r) => {
    if (!categories.includes(r.category)) categories.push(r.category)
  })

  // ─── Cell edit ────────────────────────────────────────────────
  function startEdit(row: SubcategoryRow, month: number) {
    const cellKey = `${row.category}-${row.subcategory}-${month}`
    const current = row.months[month]?.amount ?? 0
    setEditingCell(cellKey)
    setEditValue(current === 0 ? "" : String(current))
  }

  async function saveEdit(row: SubcategoryRow, month: number) {
    const numValue = parseFloat(editValue.replace(/[^0-9.-]/g, "")) || 0
    setEditingCell(null)

    const existing = row.months[month]
    if (existing) {
      // Update existing line
      if (existing.amount === numValue) return
      await fetch("/api/pnl", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id, amount: numValue }),
      })
    } else {
      // Create new line for this month
      await fetch("/api/pnl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: row.category,
          subcategory: row.subcategory,
          month,
          year,
          amount: numValue,
          source: row.source,
          sort_order: row.sort_order,
        }),
      })
    }
    await fetchData()
  }

  // ─── Add new row ──────────────────────────────────────────────
  async function handleAddRow() {
    if (!newRow.subcategory.trim()) return
    setSaving(true)
    try {
      // Determine sort_order: max of existing + 10
      const existingInCat = allRows.filter((r) => r.category === newRow.category)
      const maxSort = existingInCat.reduce((m, r) => Math.max(m, r.sort_order), 0)

      // Create entries for months 1-12 with 0 amount
      for (let m = 1; m <= 12; m++) {
        await fetch("/api/pnl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: newRow.category,
            subcategory: newRow.subcategory.trim(),
            month: m,
            year,
            amount: 0,
            source: "manual",
            sort_order: maxSort + 10,
          }),
        })
      }
      setShowAddRow(false)
      setNewRow({ category: "Chiffre d'affaires", subcategory: "" })
      await fetchData()
    } catch {
      alert("Erreur lors de l'ajout")
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete a row (all months) ────────────────────────────────
  async function handleDeleteRow(row: SubcategoryRow) {
    if (!confirm(`Supprimer "${row.subcategory}" de ${row.category} ?`)) return
    await fetch("/api/pnl", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: row.category, subcategory: row.subcategory, year }),
    })
    await fetchData()
  }

  // ─── Compute totals ──────────────────────────────────────────
  function getCategoryTotal(cat: string, month: number): number {
    return allRows
      .filter((r) => r.category === cat)
      .reduce((s, r) => s + (r.months[month]?.amount ?? 0), 0)
  }

  function getNetTotal(month: number): number {
    return allRows.reduce((s, r) => s + (r.months[month]?.amount ?? 0), 0)
  }

  function getRowYearTotal(row: SubcategoryRow): number {
    return MONTHS.reduce((s, m) => s + (row.months[m]?.amount ?? 0), 0)
  }

  function getCategoryYearTotal(cat: string): number {
    return MONTHS.reduce((s, m) => s + getCategoryTotal(cat, m), 0)
  }

  function getNetYearTotal(): number {
    return MONTHS.reduce((s, m) => s + getNetTotal(m), 0)
  }

  // Margin brute = CA + Coûts des ventes
  function getMarginBrute(month: number): number {
    return getCategoryTotal("Chiffre d'affaires", month) + getCategoryTotal("Coûts des ventes", month)
  }

  function getMarginBruteYear(): number {
    return MONTHS.reduce((s, m) => s + getMarginBrute(m), 0)
  }

  // Margin brute % = margin brute / CA
  function getMarginBrutePct(month: number): number {
    const ca = getCategoryTotal("Chiffre d'affaires", month)
    if (ca === 0) return 0
    return (getMarginBrute(month) / ca) * 100
  }

  // ─── KPIs ─────────────────────────────────────────────────────
  const caYear = getCategoryYearTotal("Chiffre d'affaires")
  const netYear = getNetYearTotal()
  const marginBruteYear = getMarginBruteYear()
  const marginBrutePctYear = caYear > 0 ? (marginBruteYear / caYear) * 100 : 0
  const netPctYear = caYear > 0 ? (netYear / caYear) * 100 : 0

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="P&L"
        subtitle="Compte de résultat mensuel"
        actions={
          <div className="flex gap-2">
            <select
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
            <Button size="sm" onClick={() => setShowAddRow(true)}>
              <Plus className="h-4 w-4" />
              Ajouter ligne
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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">CA {year}</div>
                <div className="text-xl font-bold text-zinc-900">{formatCurrency(caYear)}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Marge brute</div>
                <div className="text-xl font-bold text-zinc-900">{formatCurrency(marginBruteYear)}</div>
                <div className="text-xs text-zinc-400">{marginBrutePctYear.toFixed(1)}% du CA</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Résultat net</div>
                <div className={`text-xl font-bold ${netYear >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(netYear)}
                </div>
                <div className="text-xs text-zinc-400">{netPctYear.toFixed(1)}% du CA</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Tendance</div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const currentMonth = new Date().getMonth() + 1
                    const thisMonth = getNetTotal(currentMonth)
                    const lastMonth = getNetTotal(currentMonth - 1)
                    if (lastMonth === 0) return <span className="text-zinc-400">—</span>
                    const pct = ((thisMonth - lastMonth) / Math.abs(lastMonth)) * 100
                    return (
                      <>
                        {pct >= 0 ? (
                          <TrendingUp className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        )}
                        <span className={`text-lg font-bold ${pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                        </span>
                        <span className="text-xs text-zinc-400">vs mois précédent</span>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Add Row Modal */}
            {showAddRow && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Catégorie</label>
                      <select
                        className="rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm"
                        value={newRow.category}
                        onChange={(e) => setNewRow({ ...newRow, category: e.target.value })}
                      >
                        {CATEGORY_ORDER.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Sous-catégorie</label>
                      <input
                        type="text"
                        className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
                        value={newRow.subcategory}
                        onChange={(e) => setNewRow({ ...newRow, subcategory: e.target.value })}
                        placeholder="Ex: Consulting, Packaging..."
                        onKeyDown={(e) => e.key === "Enter" && handleAddRow()}
                      />
                    </div>
                    <Button size="sm" onClick={handleAddRow} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setShowAddRow(false)}>
                      Annuler
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* P&L Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Compte de Résultat {year}</CardTitle>
                <Badge variant="info">{allRows.length} lignes</Badge>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                  <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "180px" }} />
                      {MONTHS.map((m) => (
                        <col key={m} style={{ width: "85px" }} />
                      ))}
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "32px" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-zinc-300">
                        <th className="pb-3 text-left font-medium text-zinc-500 sticky left-0 bg-white z-10">
                          Catégorie
                        </th>
                        {MONTH_LABELS.map((m, i) => (
                          <th key={i} className="pb-3 text-right font-medium text-zinc-500">
                            {m}
                          </th>
                        ))}
                        <th className="pb-3 text-right font-bold text-zinc-700">Total</th>
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    {categories.map((cat) => {
                      const catRows = allRows.filter((r) => r.category === cat)
                      const style = CATEGORY_STYLE[cat] || { bg: "bg-zinc-50", text: "text-zinc-900", sign: -1 }
                      const catYearTotal = getCategoryYearTotal(cat)

                      return (
                        <tbody key={cat}>
                          {/* Category header row */}
                            <tr className={`border-b border-zinc-200 ${style.bg}`}>
                              <td className={`py-2.5 px-2 font-bold ${style.text} sticky left-0 ${style.bg} z-10`}>
                                {cat}
                              </td>
                              {MONTHS.map((m) => {
                                const total = getCategoryTotal(cat, m)
                                return (
                                  <td key={m} className={`py-2.5 text-right font-bold ${style.text}`}>
                                    {total !== 0 ? formatCurrency(total) : ""}
                                  </td>
                                )
                              })}
                              <td className={`py-2.5 text-right font-bold ${style.text}`}>
                                {catYearTotal !== 0 ? formatCurrency(catYearTotal) : ""}
                              </td>
                              <td></td>
                            </tr>

                            {/* Subcategory rows */}
                            {catRows.map((row) => {
                              const rowTotal = getRowYearTotal(row)
                              return (
                                <tr key={`${row.category}-${row.subcategory}`} className="border-b border-zinc-100 hover:bg-zinc-50/50 group">
                                  <td className="py-2 px-2 pl-6 text-zinc-600 sticky left-0 bg-white group-hover:bg-zinc-50/50 z-10">
                                    <div className="flex items-center gap-1">
                                      {row.subcategory}
                                      {row.source === "auto" && (
                                        <span className="text-[10px] text-violet-400 font-medium">AUTO</span>
                                      )}
                                    </div>
                                  </td>
                                  {MONTHS.map((m) => {
                                    const cellKey = `${row.category}-${row.subcategory}-${m}`
                                    const cellData = row.months[m]
                                    const amount = cellData?.amount ?? 0
                                    const isEditing = editingCell === cellKey

                                    return (
                                      <td key={m} className="py-1 text-right">
                                        {isEditing ? (
                                          <input
                                            type="text"
                                            className="w-full text-right text-sm border-2 border-zinc-900 bg-white rounded px-1.5 py-1 focus:outline-none"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onBlur={() => saveEdit(row, m)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") saveEdit(row, m)
                                              if (e.key === "Escape") setEditingCell(null)
                                            }}
                                            autoFocus
                                          />
                                        ) : (
                                          <button
                                            className="w-full text-right px-1.5 py-1 rounded hover:bg-zinc-100 transition-colors cursor-text"
                                            onClick={() => startEdit(row, m)}
                                          >
                                            {amount !== 0 ? (
                                              <span className={amount < 0 ? "text-red-600" : "text-zinc-700"}>
                                                {formatCurrency(amount)}
                                              </span>
                                            ) : (
                                              <span className="text-zinc-300">—</span>
                                            )}
                                          </button>
                                        )}
                                      </td>
                                    )
                                  })}
                                  <td className="py-2 text-right font-medium text-zinc-700">
                                    {rowTotal !== 0 ? formatCurrency(rowTotal) : ""}
                                  </td>
                                  <td className="py-2 text-center">
                                    <button
                                      className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all"
                                      onClick={() => handleDeleteRow(row)}
                                      title="Supprimer cette ligne"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}

                            {/* Margin brute after Coûts des ventes */}
                            {cat === "Coûts des ventes" && (
                              <tr className="border-b-2 border-zinc-300 bg-zinc-100">
                                <td className="py-2.5 px-2 font-bold text-zinc-800 sticky left-0 bg-zinc-100 z-10 flex items-center gap-1">
                                  <Minus className="h-3.5 w-3.5" />
                                  Marge brute
                                </td>
                                {MONTHS.map((m) => {
                                  const mb = getMarginBrute(m)
                                  const pct = getMarginBrutePct(m)
                                  return (
                                    <td key={m} className="py-2.5 text-right">
                                      {mb !== 0 && (
                                        <>
                                          <div className="font-bold text-zinc-800">{formatCurrency(mb)}</div>
                                          <div className="text-[10px] text-zinc-400">{pct.toFixed(0)}%</div>
                                        </>
                                      )}
                                    </td>
                                  )
                                })}
                                <td className="py-2.5 text-right">
                                  <div className="font-bold text-zinc-800">{formatCurrency(getMarginBruteYear())}</div>
                                  <div className="text-[10px] text-zinc-400">{marginBrutePctYear.toFixed(0)}%</div>
                                </td>
                                <td></td>
                              </tr>
                            )}
                          </tbody>
                        )
                      })}

                    <tbody>
                      {/* NET RESULT */}
                      <tr className="border-t-2 border-zinc-400 bg-zinc-900 text-white">
                        <td className="py-3 px-2 font-bold sticky left-0 bg-zinc-900 z-10">RÉSULTAT NET</td>
                        {MONTHS.map((m) => {
                          const net = getNetTotal(m)
                          return (
                            <td key={m} className="py-3 text-right font-bold">
                              {net !== 0 && (
                                <span className={net < 0 ? "text-red-400" : "text-emerald-400"}>
                                  {formatCurrency(net)}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="py-3 text-right font-bold">
                          <span className={netYear < 0 ? "text-red-400" : "text-emerald-400"}>
                            {formatCurrency(netYear)}
                          </span>
                        </td>
                        <td></td>
                      </tr>

                      {/* Net margin % */}
                      <tr className="bg-zinc-800 text-zinc-400">
                        <td className="py-2 px-2 text-xs font-medium sticky left-0 bg-zinc-800 z-10">
                          % marge nette
                        </td>
                        {MONTHS.map((m) => {
                          const ca = getCategoryTotal("Chiffre d'affaires", m)
                          const net = getNetTotal(m)
                          const pct = ca > 0 ? (net / ca) * 100 : 0
                          return (
                            <td key={m} className="py-2 text-right text-xs">
                              {ca > 0 && (
                                <span className={pct < 0 ? "text-red-400" : "text-emerald-400"}>
                                  {pct.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="py-2 text-right text-xs">
                          <span className={netPctYear < 0 ? "text-red-400" : "text-emerald-400"}>
                            {netPctYear.toFixed(1)}%
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
