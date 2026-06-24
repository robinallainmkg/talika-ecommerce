"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import {
  Loader2, Plus, Trash2, TrendingUp, TrendingDown, Minus,
  ChevronRight, ChevronDown, RefreshCw, RotateCcw, Lock,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────
interface PnLLine {
  id: string
  category: string
  parent: string
  subcategory: string
  month: number
  year: number
  amount: number
  source: string
  sort_order: number
}

interface SubRow {
  category: string
  parent: string
  subcategory: string
  sort_order: number
  months: Record<number, { id: string; amount: number; source: string }>
}

// A render item is either a single (top-level) line or an expandable group
type RenderItem =
  | { type: "leaf"; sort_order: number; row: SubRow }
  | { type: "group"; sort_order: number; category: string; parent: string; children: SubRow[] }

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"]

const REVENUE_CAT = "Chiffre d'affaires"
const CATEGORY_ORDER = [REVENUE_CAT, "Coûts des ventes", "Marketing", "Équipe & frais fixes"]
// Lignes alimentées par la sync auto (cf. src/lib/sync/pnl-auto.ts)
const AUTO_SUBS = new Set(["Ventes Shopify", "Meta Ads", "Google Ads", "Influence"])

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  [REVENUE_CAT]: { bg: "bg-emerald-50", text: "text-emerald-900" },
  "Coûts des ventes": { bg: "bg-red-50", text: "text-red-900" },
  Marketing: { bg: "bg-amber-50", text: "text-amber-900" },
  "Équipe & frais fixes": { bg: "bg-blue-50", text: "text-blue-900" },
}

const isRevenue = (cat: string) => cat === REVENUE_CAT

// ─── Page ─────────────────────────────────────────────────────────
export default function PnLPage() {
  const [lines, setLines] = useState<PnLLine[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(2026)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRow, setNewRow] = useState({ category: REVENUE_CAT, subcategory: "" })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addDetailFor, setAddDetailFor] = useState<string | null>(null)
  const [detailName, setDetailName] = useState("")

  // ─── Load data ────────────────────────────────────────────────
  // silent = recharge en arrière-plan sans le spinner plein écran (pas de "refresh"
  // visible). Utilisé après les opérations structurelles ; les éditions de cellule,
  // elles, ne rechargent plus du tout (mise à jour locale optimiste).
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch(`/api/pnl?year=${year}`, { cache: "no-store" })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setLines(json.lines || [])
    } catch {
      if (!silent) setLines([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [year])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Build SubRow map ─────────────────────────────────────────
  const rowMap = new Map<string, SubRow>()
  lines.forEach((l) => {
    const key = `${l.category}|||${l.parent}|||${l.subcategory}`
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        category: l.category, parent: l.parent, subcategory: l.subcategory,
        sort_order: l.sort_order, months: {},
      })
    }
    rowMap.get(key)!.months[l.month] = { id: l.id, amount: l.amount, source: l.source }
  })
  const allRows = Array.from(rowMap.values())

  const categories = CATEGORY_ORDER.filter((c) => allRows.some((r) => r.category === c))
  allRows.forEach((r) => { if (!categories.includes(r.category)) categories.push(r.category) })

  // Build render items for a category (leaves + groups), sorted
  function renderItems(cat: string): RenderItem[] {
    const rows = allRows.filter((r) => r.category === cat)
    const leaves = rows.filter((r) => !r.parent)
    const grouped = rows.filter((r) => r.parent)
    const groupMap = new Map<string, SubRow[]>()
    grouped.forEach((r) => {
      if (!groupMap.has(r.parent)) groupMap.set(r.parent, [])
      groupMap.get(r.parent)!.push(r)
    })
    const items: RenderItem[] = []
    leaves.forEach((row) => items.push({ type: "leaf", sort_order: row.sort_order, row }))
    groupMap.forEach((children, parent) => {
      children.sort((a, b) => a.sort_order - b.sort_order)
      const minSort = Math.min(...children.map((c) => c.sort_order))
      items.push({ type: "group", sort_order: minSort, category: cat, parent, children })
    })
    return items.sort((a, b) => a.sort_order - b.sort_order)
  }

  // ─── Amounts helpers ───────────────────────────────────────────
  const rowMonth = (row: SubRow, m: number) => row.months[m]?.amount ?? 0
  const rowYear = (row: SubRow) => MONTHS.reduce((s, m) => s + rowMonth(row, m), 0)
  const groupMonth = (children: SubRow[], m: number) => children.reduce((s, r) => s + rowMonth(r, m), 0)
  const groupYear = (children: SubRow[]) => children.reduce((s, r) => s + rowYear(r), 0)

  function categoryMonth(cat: string, m: number): number {
    return allRows.filter((r) => r.category === cat).reduce((s, r) => s + rowMonth(r, m), 0)
  }
  const categoryYear = (cat: string) => MONTHS.reduce((s, m) => s + categoryMonth(cat, m), 0)
  const netMonth = (m: number) => allRows.reduce((s, r) => s + rowMonth(r, m), 0)
  const netYear = () => MONTHS.reduce((s, m) => s + netMonth(m), 0)
  const marginBrute = (m: number) => categoryMonth(REVENUE_CAT, m) + categoryMonth("Coûts des ventes", m)
  const marginBruteYear = () => MONTHS.reduce((s, m) => s + marginBrute(m), 0)

  // ─── Cell edit (sign applied by category: CA +, coûts −) ───────
  function startEdit(cellKey: string, amount: number) {
    setEditingCell(cellKey)
    setEditValue(amount === 0 ? "" : String(Math.abs(amount)))
  }

  async function saveEdit(row: SubRow, month: number) {
    const raw = parseFloat(editValue.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0
    const signed = isRevenue(row.category) ? Math.abs(raw) : -Math.abs(raw)
    setEditingCell(null)

    const existing = row.months[month]
    if (existing) {
      if (existing.amount === signed) return
      // Mise à jour locale optimiste : la cellule change instantanément, sans rechargement.
      // L'édition fige la cellule (source:"manual") côté UI comme côté API.
      setLines((prev) =>
        prev.map((l) => (l.id === existing.id ? { ...l, amount: signed, source: "manual" } : l))
      )
      const res = await fetch("/api/pnl", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing.id, amount: signed }),
      })
      if (!res.ok) fetchData(true) // resync discret si l'écriture a échoué
    } else {
      // Cellule inexistante : on a besoin de l'id renvoyé → on attend la réponse puis on l'insère.
      const res = await fetch("/api/pnl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: row.category, parent: row.parent, subcategory: row.subcategory,
          month, year, amount: signed, source: "manual", sort_order: row.sort_order,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.line) setLines((prev) => [...prev, json.line])
      else fetchData(true)
    }
  }

  // Réactiver l'auto sur une cellule figée puis recalculer
  async function resetToAuto(id: string) {
    await fetch("/api/pnl", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, source: "auto" }),
    })
    await fetch(`/api/pnl/sync?year=${year}`, { method: "POST" })
    await fetchData(true)
  }

  // ─── Recalculer l'auto ─────────────────────────────────────────
  async function recalcAuto() {
    setSyncing(true)
    try {
      await fetch(`/api/pnl/sync?year=${year}`, { method: "POST" })
      await fetchData(true)
    } finally {
      setSyncing(false)
    }
  }

  // ─── Add top-level row ─────────────────────────────────────────
  async function handleAddRow() {
    if (!newRow.subcategory.trim()) return
    setSaving(true)
    try {
      const existingInCat = allRows.filter((r) => r.category === newRow.category && !r.parent)
      const maxSort = existingInCat.reduce((mx, r) => Math.max(mx, r.sort_order), 0)
      for (let m = 1; m <= 12; m++) {
        await fetch("/api/pnl", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: newRow.category, parent: "", subcategory: newRow.subcategory.trim(),
            month: m, year, amount: 0, source: "manual", sort_order: maxSort + 10,
          }),
        })
      }
      setShowAddRow(false)
      setNewRow({ category: REVENUE_CAT, subcategory: "" })
      await fetchData(true)
    } finally {
      setSaving(false)
    }
  }

  // ─── Add detail line under a group ─────────────────────────────
  async function handleAddDetail(category: string, parent: string, children: SubRow[]) {
    if (!detailName.trim()) return
    setSaving(true)
    try {
      const maxSort = children.reduce((mx, r) => Math.max(mx, r.sort_order), 0)
      for (let m = 1; m <= 12; m++) {
        await fetch("/api/pnl", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category, parent, subcategory: detailName.trim(),
            month: m, year, amount: 0, source: "manual", sort_order: maxSort + 1,
          }),
        })
      }
      setAddDetailFor(null)
      setDetailName("")
      await fetchData(true)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(row: SubRow) {
    if (!confirm(`Supprimer "${row.subcategory}" ?`)) return
    await fetch("/api/pnl", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: row.category, parent: row.parent, subcategory: row.subcategory, year }),
    })
    await fetchData(true)
  }

  async function deleteGroup(category: string, parent: string) {
    if (!confirm(`Supprimer le groupe "${parent}" et tout son détail ?`)) return
    await fetch("/api/pnl", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, parent, year, deleteGroup: true }),
    })
    await fetchData(true)
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ─── KPIs ─────────────────────────────────────────────────────
  const caYear = categoryYear(REVENUE_CAT)
  const nety = netYear()
  const mbY = marginBruteYear()
  const mbPct = caYear > 0 ? (mbY / caYear) * 100 : 0
  const netPct = caYear > 0 ? (nety / caYear) * 100 : 0

  // ─── Cell renderer ─────────────────────────────────────────────
  function Cell({ row, m }: { row: SubRow; m: number }) {
    const cellKey = `${row.category}-${row.parent}-${row.subcategory}-${m}`
    const cell = row.months[m]
    const amount = cell?.amount ?? 0
    const isEditing = editingCell === cellKey
    const isAuto = cell?.source === "auto"
    const autoEligible = AUTO_SUBS.has(row.subcategory)
    const frozen = autoEligible && cell && cell.source === "manual"

    if (isEditing) {
      return (
        <td className="py-1 text-right">
          <input
            type="text" autoFocus value={editValue}
            className="w-full text-right text-sm border-2 border-zinc-900 bg-white rounded px-1.5 py-1 focus:outline-none"
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(row, m)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit(row, m)
              if (e.key === "Escape") setEditingCell(null)
            }}
          />
        </td>
      )
    }
    return (
      <td className="py-1 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {frozen && cell && (
            <button title="Réactiver le calcul auto" onClick={() => resetToAuto(cell.id)}
              className="opacity-0 group-hover:opacity-100 text-violet-400 hover:text-violet-600 transition">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button onClick={() => startEdit(cellKey, amount)}
            className="text-right px-1.5 py-1 rounded hover:bg-zinc-100 transition cursor-text">
            {amount !== 0 ? (
              <span className={isAuto ? "text-violet-600" : amount < 0 ? "text-red-600" : "text-zinc-700"}>
                {formatCurrency(amount)}
              </span>
            ) : (
              <span className="text-zinc-300">—</span>
            )}
          </button>
        </div>
      </td>
    )
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div>
      <Header
        title="P&L"
        subtitle="Compte de résultat mensuel — auto + saisie"
        actions={
          <div className="flex gap-2">
            <select className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
              value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
            <Button size="sm" variant="secondary" onClick={recalcAuto} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recalculer l&apos;auto
            </Button>
            <Button size="sm" onClick={() => setShowAddRow(true)}>
              <Plus className="h-4 w-4" /> Ajouter ligne
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-zinc-400" /></div>
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
                <div className="text-xl font-bold text-zinc-900">{formatCurrency(mbY)}</div>
                <div className="text-xs text-zinc-400">{mbPct.toFixed(1)}% du CA</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Résultat net</div>
                <div className={`text-xl font-bold ${nety >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(nety)}
                </div>
                <div className="text-xs text-zinc-400">{netPct.toFixed(1)}% du CA</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-medium text-zinc-500 mb-1">Tendance</div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const cm = new Date().getMonth() + 1
                    const tm = netMonth(cm), lm = netMonth(cm - 1)
                    if (lm === 0) return <span className="text-zinc-400">—</span>
                    const pct = ((tm - lm) / Math.abs(lm)) * 100
                    return (
                      <>
                        {pct >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
                        <span className={`text-lg font-bold ${pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                        </span>
                        <span className="text-xs text-zinc-400">vs mois préc.</span>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Add Row Modal */}
            {showAddRow && (
              <Card><CardContent className="pt-6">
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Catégorie</label>
                    <select className="rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm"
                      value={newRow.category} onChange={(e) => setNewRow({ ...newRow, category: e.target.value })}>
                      {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Nom de la ligne</label>
                    <input type="text" autoFocus value={newRow.subcategory}
                      className="w-full rounded-md border-2 border-zinc-200 bg-white px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
                      onChange={(e) => setNewRow({ ...newRow, subcategory: e.target.value })}
                      placeholder="Ex: Consulting, Packaging…"
                      onKeyDown={(e) => e.key === "Enter" && handleAddRow()} />
                  </div>
                  <Button size="sm" onClick={handleAddRow} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowAddRow(false)}>Annuler</Button>
                </div>
              </CardContent></Card>
            )}

            {/* P&L Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Compte de Résultat {year}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] text-violet-500">
                    <span className="h-2 w-2 rounded-full bg-violet-500" /> auto
                  </span>
                  <Badge variant="info">{allRows.length} lignes</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
                  <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      <col style={{ width: "190px" }} />
                      {MONTHS.map((m) => <col key={m} style={{ width: "82px" }} />)}
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "28px" }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-zinc-300">
                        <th className="pb-3 text-left font-medium text-zinc-500 sticky left-0 bg-white z-10">Catégorie</th>
                        {MONTH_LABELS.map((m, i) => <th key={i} className="pb-3 text-right font-medium text-zinc-500">{m}</th>)}
                        <th className="pb-3 text-right font-bold text-zinc-700">Total</th>
                        <th className="pb-3"></th>
                      </tr>
                    </thead>

                    {categories.map((cat) => {
                      const style = CATEGORY_STYLE[cat] || { bg: "bg-zinc-50", text: "text-zinc-900" }
                      const items = renderItems(cat)
                      return (
                        <tbody key={cat}>
                          {/* Category header */}
                          <tr className={`border-b border-zinc-200 ${style.bg}`}>
                            <td className={`py-2.5 px-2 font-bold ${style.text} sticky left-0 ${style.bg} z-10`}>{cat}</td>
                            {MONTHS.map((m) => {
                              const t = categoryMonth(cat, m)
                              return <td key={m} className={`py-2.5 text-right font-bold ${style.text}`}>{t !== 0 ? formatCurrency(t) : ""}</td>
                            })}
                            <td className={`py-2.5 text-right font-bold ${style.text}`}>{categoryYear(cat) !== 0 ? formatCurrency(categoryYear(cat)) : ""}</td>
                            <td></td>
                          </tr>

                          {items.map((item) => {
                            if (item.type === "leaf") {
                              const row = item.row
                              const autoEligible = AUTO_SUBS.has(row.subcategory)
                              return (
                                <tr key={`leaf-${row.subcategory}`} className="border-b border-zinc-100 hover:bg-zinc-50/50 group">
                                  <td className="py-2 px-2 pl-6 text-zinc-600 sticky left-0 bg-white group-hover:bg-zinc-50/50 z-10">
                                    <div className="flex items-center gap-1">
                                      {row.subcategory}
                                      {autoEligible && <span className="text-[9px] text-violet-400 font-semibold tracking-wide">AUTO</span>}
                                    </div>
                                  </td>
                                  {MONTHS.map((m) => <Cell key={m} row={row} m={m} />)}
                                  <td className="py-2 text-right font-medium text-zinc-700">{rowYear(row) !== 0 ? formatCurrency(rowYear(row)) : ""}</td>
                                  <td className="py-2 text-center">
                                    <button className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition" onClick={() => deleteRow(row)} title="Supprimer">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            }
                            // group
                            const gkey = `${item.category}|||${item.parent}`
                            const open = !collapsed.has(gkey)
                            return (
                              <Fragment key={`group-${item.parent}`}>
                                <tr className="border-b border-zinc-100 bg-zinc-50/60 hover:bg-zinc-100/60 group">
                                  <td className="py-2 px-2 pl-3 font-medium text-zinc-700 sticky left-0 bg-zinc-50/60 z-10">
                                    <button className="flex items-center gap-1" onClick={() => toggleGroup(gkey)}>
                                      {open ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                                      {item.parent}
                                      <span className="text-[9px] text-zinc-400">({item.children.length})</span>
                                    </button>
                                  </td>
                                  {MONTHS.map((m) => {
                                    const t = groupMonth(item.children, m)
                                    return <td key={m} className="py-2 text-right font-medium text-zinc-500">{t !== 0 ? formatCurrency(t) : ""}</td>
                                  })}
                                  <td className="py-2 text-right font-semibold text-zinc-700">{groupYear(item.children) !== 0 ? formatCurrency(groupYear(item.children)) : ""}</td>
                                  <td className="py-2 text-center">
                                    <button className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition" onClick={() => deleteGroup(item.category, item.parent)} title="Supprimer le groupe">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>

                                {open && item.children.map((row) => (
                                  <tr key={`child-${item.parent}-${row.subcategory}`} className="border-b border-zinc-50 hover:bg-zinc-50/40 group text-zinc-500">
                                    <td className="py-1.5 px-2 pl-10 sticky left-0 bg-white group-hover:bg-zinc-50/40 z-10 text-[13px]">{row.subcategory}</td>
                                    {MONTHS.map((m) => <Cell key={m} row={row} m={m} />)}
                                    <td className="py-1.5 text-right text-[13px] text-zinc-600">{rowYear(row) !== 0 ? formatCurrency(rowYear(row)) : ""}</td>
                                    <td className="py-1.5 text-center">
                                      <button className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition" onClick={() => deleteRow(row)} title="Supprimer">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}

                                {open && (
                                  <tr className="border-b border-zinc-50">
                                    <td className="py-1 px-2 pl-10 sticky left-0 bg-white z-10" colSpan={15}>
                                      {addDetailFor === gkey ? (
                                        <div className="flex items-center gap-2">
                                          <input type="text" autoFocus value={detailName}
                                            className="rounded border-2 border-zinc-300 px-2 py-0.5 text-xs focus:border-zinc-900 focus:outline-none"
                                            placeholder="Nom du détail…" onChange={(e) => setDetailName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleAddDetail(item.category, item.parent, item.children); if (e.key === "Escape") setAddDetailFor(null) }} />
                                          <Button size="sm" onClick={() => handleAddDetail(item.category, item.parent, item.children)} disabled={saving}>
                                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ajouter"}
                                          </Button>
                                          <button className="text-xs text-zinc-400" onClick={() => setAddDetailFor(null)}>Annuler</button>
                                        </div>
                                      ) : (
                                        <button className="text-[11px] text-zinc-400 hover:text-zinc-700 flex items-center gap-1" onClick={() => { setAddDetailFor(gkey); setDetailName("") }}>
                                          <Plus className="h-3 w-3" /> détail
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}

                          {/* Marge brute après Coûts des ventes */}
                          {cat === "Coûts des ventes" && (
                            <tr className="border-b-2 border-zinc-300 bg-zinc-100">
                              <td className="py-2.5 px-2 font-bold text-zinc-800 sticky left-0 bg-zinc-100 z-10 flex items-center gap-1">
                                <Minus className="h-3.5 w-3.5" /> Marge brute
                              </td>
                              {MONTHS.map((m) => {
                                const mb = marginBrute(m)
                                const ca = categoryMonth(REVENUE_CAT, m)
                                const pct = ca > 0 ? (mb / ca) * 100 : 0
                                return (
                                  <td key={m} className="py-2.5 text-right">
                                    {mb !== 0 && (<>
                                      <div className="font-bold text-zinc-800">{formatCurrency(mb)}</div>
                                      <div className="text-[10px] text-zinc-400">{pct.toFixed(0)}%</div>
                                    </>)}
                                  </td>
                                )
                              })}
                              <td className="py-2.5 text-right">
                                <div className="font-bold text-zinc-800">{formatCurrency(mbY)}</div>
                                <div className="text-[10px] text-zinc-400">{mbPct.toFixed(0)}%</div>
                              </td>
                              <td></td>
                            </tr>
                          )}
                        </tbody>
                      )
                    })}

                    <tbody>
                      <tr className="border-t-2 border-zinc-400 bg-zinc-900 text-white">
                        <td className="py-3 px-2 font-bold sticky left-0 bg-zinc-900 z-10">RÉSULTAT NET</td>
                        {MONTHS.map((m) => {
                          const n = netMonth(m)
                          return <td key={m} className="py-3 text-right font-bold">{n !== 0 && <span className={n < 0 ? "text-red-400" : "text-emerald-400"}>{formatCurrency(n)}</span>}</td>
                        })}
                        <td className="py-3 text-right font-bold"><span className={nety < 0 ? "text-red-400" : "text-emerald-400"}>{formatCurrency(nety)}</span></td>
                        <td></td>
                      </tr>
                      <tr className="bg-zinc-800 text-zinc-400">
                        <td className="py-2 px-2 text-xs font-medium sticky left-0 bg-zinc-800 z-10">% marge nette</td>
                        {MONTHS.map((m) => {
                          const ca = categoryMonth(REVENUE_CAT, m), n = netMonth(m)
                          const pct = ca > 0 ? (n / ca) * 100 : 0
                          return <td key={m} className="py-2 text-right text-xs">{ca > 0 && <span className={pct < 0 ? "text-red-400" : "text-emerald-400"}>{pct.toFixed(1)}%</span>}</td>
                        })}
                        <td className="py-2 text-right text-xs"><span className={netPct < 0 ? "text-red-400" : "text-emerald-400"}>{netPct.toFixed(1)}%</span></td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-zinc-400">
                  <Lock className="inline h-3 w-3 mr-1" />
                  Les lignes <span className="text-violet-500">AUTO</span> (CA Shopify, Meta, Google, Influence) se recalculent à chaque sync.
                  Dès que tu écrases une valeur, elle est figée — clique l&apos;icône <RotateCcw className="inline h-3 w-3" /> pour réactiver l&apos;auto.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
