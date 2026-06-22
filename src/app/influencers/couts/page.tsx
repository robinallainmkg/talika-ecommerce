"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Save, Wand2, ArrowLeft, RefreshCw } from "lucide-react"

interface Row {
  influencer_id: string
  name: string
  status: string | null
  commission_rate: number
  month_sales: number
  suggested_commission: number | null
  saved_commission: number | null
  fixed_fee: number | null
  fixed_fee_label: string | null
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

export default function CoutsInfluencePage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<Row[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/influencers/commissions?year=${year}&month=${month}`, {
        cache: "no-store",
      })
      const data = await res.json()
      const list: Row[] = data.rows || []
      setRows(list)
      // Pré-remplit la saisie : commission déjà saisie, sinon la suggestion.
      const d: Record<string, string> = {}
      for (const r of list) {
        const v = r.saved_commission ?? r.suggested_commission
        d[r.influencer_id] = v != null ? String(v) : ""
      }
      setDraft(d)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  function applySuggestions() {
    setDraft((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (r.suggested_commission != null) next[r.influencer_id] = String(r.suggested_commission)
      }
      return next
    })
  }

  async function save() {
    setSaving(true)
    setFeedback(null)
    const entries = rows
      .map((r) => ({ influencer_id: r.influencer_id, amount: parseFloat(draft[r.influencer_id]), month, year }))
      .filter((e) => !isNaN(e.amount))
    try {
      const res = await fetch("/api/influencers/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Échec de l'enregistrement." })
      } else {
        setFeedback({ type: "ok", text: `${data.saved} commission(s) enregistrée(s).` })
        load()
      }
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau." })
    } finally {
      setSaving(false)
    }
  }

  const totalCommissions = rows.reduce((s, r) => {
    const v = parseFloat(draft[r.influencer_id])
    return s + (isNaN(v) ? 0 : v)
  }, 0)
  const totalFees = rows.reduce((s, r) => s + (r.fixed_fee || 0), 0)
  const totalSales = rows.reduce((s, r) => s + r.month_sales, 0)

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/influencers" className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600">
              <ArrowLeft className="h-3 w-3" /> Influenceurs
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-900">Saisie des coûts influence</h1>
            <p className="text-sm text-zinc-500">
              La commission est calculée automatiquement (taux × ventes du code). Valide ou ajuste, puis enregistre.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {[2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={load} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50" title="Rafraîchir">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{feedback.text}</p>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 p-3">
            <button onClick={applySuggestions}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
              <Wand2 className="h-3.5 w-3.5" /> Appliquer toutes les suggestions
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Enregistrement…" : "Enregistrer les commissions"}
            </button>
          </div>

          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-zinc-400">Aucune influenceuse avec ventes ou commission ce mois-ci.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                  <th className="px-3 py-2">Influenceuse</th>
                  <th className="px-3 py-2 text-right">Ventes du mois</th>
                  <th className="px-3 py-2 text-right">Taux</th>
                  <th className="px-3 py-2 text-right">Suggérée</th>
                  <th className="px-3 py-2 text-right">Commission à enregistrer</th>
                  <th className="px-3 py-2 text-right">Forfait</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const edited = parseFloat(draft[r.influencer_id])
                  const diffFromSuggest =
                    r.suggested_commission != null && !isNaN(edited) && Math.abs(edited - r.suggested_commission) > 0.5
                  return (
                    <tr key={r.influencer_id} className="border-b border-zinc-100">
                      <td className="px-3 py-2.5 font-medium text-zinc-900">{r.name}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-600">{formatCurrency(r.month_sales)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-500">{r.commission_rate ? `${r.commission_rate}%` : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-500">
                        {r.suggested_commission != null ? formatCurrency(r.suggested_commission) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={draft[r.influencer_id] ?? ""}
                            onChange={(e) => setDraft((p) => ({ ...p, [r.influencer_id]: e.target.value }))}
                            className={`w-28 rounded-md border px-2 py-1 text-right text-sm focus:outline-none ${
                              diffFromSuggest ? "border-amber-300 bg-amber-50" : "border-zinc-300"
                            }`}
                            placeholder="—"
                          />
                          <span className="text-xs text-zinc-400">€</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-500">
                        {r.fixed_fee != null ? formatCurrency(r.fixed_fee) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-50 font-semibold text-zinc-900">
                  <td className="px-3 py-2.5">Total ({rows.length})</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(totalSales)}</td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(totalCommissions)}</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(totalFees)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <p className="text-xs text-zinc-400">
          Les forfaits (factures, montants fixes) se saisissent sur la fiche de chaque influenceuse — bientôt regroupés ici aussi.
        </p>
      </div>
    </div>
  )
}
