"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { Loader2, Save, ArrowLeft, RefreshCw, Plus, Lock, Unlock, Paperclip } from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { MonthTabs } from "@/components/influence/month-tabs"

interface Row {
  influencer_id: string
  name: string
  commission_rate: number
  month_sales: number
  suggested_commission: number | null
  saved_commission: number | null
  fixed_fee: number | null
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
  const [allInfluencers, setAllInfluencers] = useState<{ id: string; name: string; commission_rate: number }[]>([])
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({})
  const [commDraft, setCommDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lock, setLock] = useState<{ locked_by: string | null; locked_at: string } | null>(null)
  const [locking, setLocking] = useState(false)
  const [invoicesByInf, setInvoicesByInf] = useState<Record<string, { id: string; file_name: string; amount: number | null }[]>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const isAdmin = role === "admin"
  const isLocked = !!lock
  const canEdit = !isLocked || isAdmin

  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await authClient().auth.getUser()
        setRole((data.user?.user_metadata?.role as string) ?? "member")
        setUserEmail(data.user?.email ?? null)
      } catch {
        setRole("member")
      }
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const [res, lockRes, invRes] = await Promise.all([
        fetch(`/api/influencers/commissions?year=${year}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/influencers/lock?year=${year}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/influencers/invoices?year=${year}&month=${month}`, { cache: "no-store" }),
      ])
      const data = await res.json()
      const lockData = await lockRes.json()
      setLock(lockData.locked ? lockData.lock : null)
      const invData = await invRes.json()
      const byInf: Record<string, { id: string; file_name: string; amount: number | null }[]> = {}
      for (const inv of invData.invoices || []) {
        ;(byInf[inv.influencer_id] ??= []).push({ id: inv.id, file_name: inv.file_name, amount: inv.amount })
      }
      setInvoicesByInf(byInf)
      const list: Row[] = data.rows || []
      setRows(list)
      setAllInfluencers(data.all_influencers || [])
      // On ne pré-remplit QUE ce qui est déjà enregistré (jamais la suggestion).
      const fd: Record<string, string> = {}
      const cd: Record<string, string> = {}
      for (const r of list) {
        fd[r.influencer_id] = r.fixed_fee != null ? String(r.fixed_fee) : ""
        cd[r.influencer_id] = r.saved_commission != null ? String(r.saved_commission) : ""
      }
      setFeeDraft(fd)
      setCommDraft(cd)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  function addInfluencer(id: string) {
    if (!id || rows.some((r) => r.influencer_id === id)) return
    const inf = allInfluencers.find((a) => a.id === id)
    if (!inf) return
    setRows((prev) => [
      ...prev,
      { influencer_id: inf.id, name: inf.name, commission_rate: inf.commission_rate, month_sales: 0, suggested_commission: null, saved_commission: null, fixed_fee: null },
    ])
  }

  async function uploadInvoice(influencerId: string, file: File) {
    setUploadingId(influencerId)
    setFeedback(null)
    try {
      const urlRes = await fetch("/api/influencers/invoices/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencerId, year, month, kind: "fee",
          file_name: file.name, mime_type: file.type, size_bytes: file.size,
          uploaded_by: userEmail,
        }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) {
        setFeedback({ type: "error", text: urlData.error || "Upload impossible." })
        return
      }
      const { error: upErr } = await authClient().storage
        .from(urlData.bucket)
        .uploadToSignedUrl(urlData.path, urlData.token, file)
      if (upErr) {
        setFeedback({ type: "error", text: "Échec de l'envoi du fichier." })
        return
      }
      const ocrRes = await fetch("/api/influencers/invoices/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: urlData.invoice_id }),
      })
      const ocr = await ocrRes.json()
      if (ocr.amount != null) {
        setFeeDraft((p) => ({ ...p, [influencerId]: String(ocr.amount) }))
        setFeedback({ type: "ok", text: `Facture lue : ${ocr.amount} € détecté — vérifie puis enregistre.` })
      } else {
        setFeedback({ type: "ok", text: "Facture jointe (montant non détecté — saisis-le à la main)." })
      }
      const invRes = await fetch(`/api/influencers/invoices?year=${year}&month=${month}`, { cache: "no-store" })
      const invData = await invRes.json()
      const byInf: Record<string, { id: string; file_name: string; amount: number | null }[]> = {}
      for (const inv of invData.invoices || []) {
        ;(byInf[inv.influencer_id] ??= []).push({ id: inv.id, file_name: inv.file_name, amount: inv.amount })
      }
      setInvoicesByInf(byInf)
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau pendant l'upload." })
    } finally {
      setUploadingId(null)
    }
  }

  async function save() {
    setSaving(true)
    setFeedback(null)
    const entries = rows.map((r) => ({
      influencer_id: r.influencer_id,
      fixed_fee: feeDraft[r.influencer_id] ?? "",
      commission: commDraft[r.influencer_id] ?? "",
    }))
    try {
      const res = await fetch("/api/influencers/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, entries }),
      })
      const data = await res.json()
      if (!res.ok) setFeedback({ type: "error", text: data.error || "Échec." })
      else {
        setFeedback({ type: "ok", text: "Coûts enregistrés." })
        load()
      }
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau." })
    } finally {
      setSaving(false)
    }
  }

  async function lockMonth() {
    setLocking(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/influencers/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      })
      if (res.ok) load()
      else setFeedback({ type: "error", text: "Verrouillage impossible." })
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau." })
    } finally {
      setLocking(false)
    }
  }

  async function unlockMonth() {
    setLocking(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/influencers/lock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      })
      if (res.ok) load()
      else setFeedback({ type: "error", text: "Déverrouillage réservé à l'admin." })
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau." })
    } finally {
      setLocking(false)
    }
  }

  const rowTotal = (id: string) =>
    (parseFloat(feeDraft[id]) || 0) + (parseFloat(commDraft[id]) || 0)
  const grandTotal = rows.reduce((s, r) => s + rowTotal(r.influencer_id), 0)
  const notShown = allInfluencers.filter((a) => !rows.some((r) => r.influencer_id === a.id))

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/influencers" className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600">
              <ArrowLeft className="h-3 w-3" /> Influenceurs
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-900">Coûts influence du mois</h1>
            <p className="max-w-xl text-sm text-zinc-500">
              Pour chaque influenceuse ce mois : un <strong>forfait</strong>, une <strong>commission</strong>, ou les deux
              (le plus souvent un seul). La commission peut se pré-remplir depuis ses ventes. Ça alimente le dashboard Acquisition.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={load} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-50" title="Rafraîchir">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <MonthTabs month={month} onSelect={(m) => m && setMonth(m)} />

        {/* Statut de verrouillage du mois */}
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${isLocked ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
          <div className="flex items-center gap-2">
            {isLocked ? <Lock className="h-4 w-4 text-amber-600" /> : <Unlock className="h-4 w-4 text-zinc-400" />}
            {isLocked ? (
              <span className="text-amber-800">
                <strong>{MONTHS[month - 1]} {year} verrouillé</strong>
                {lock?.locked_by ? ` par ${lock.locked_by}` : ""}
                {lock?.locked_at ? ` le ${new Date(lock.locked_at).toLocaleDateString("fr-FR")}` : ""}
                {isAdmin && " — tu peux quand même éditer (admin)."}
              </span>
            ) : (
              <span className="text-zinc-500">{MONTHS[month - 1]} {year} ouvert — verrouille quand tout est saisi.</span>
            )}
          </div>
          <div>
            {isLocked
              ? isAdmin && (
                  <button onClick={unlockMonth} disabled={locking}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                    <Unlock className="h-3.5 w-3.5" /> Déverrouiller
                  </button>
                )
              : (
                  <button onClick={lockMonth} disabled={locking}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                    {locking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    Verrouiller {MONTHS[month - 1]}
                  </button>
                )}
          </div>
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{feedback.text}</p>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          {loading && rows.length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2.5">Influenceuse</th>
                  <th className="px-3 py-2.5 text-right">Forfait (€)</th>
                  <th className="px-3 py-2.5 text-right">Commission (€)</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.influencer_id} className="border-b border-zinc-100">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-900">{r.name}</div>
                      {r.commission_rate > 0 && (
                        <div className="text-[11px] text-zinc-400">commission {r.commission_rate}%</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <label className={`rounded p-1 ${canEdit && !uploadingId ? "cursor-pointer text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" : "cursor-not-allowed text-zinc-200"}`}
                          title="Joindre la facture (PDF/image) — montant lu automatiquement">
                          {uploadingId === r.influencer_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                          <input type="file" accept=".pdf,image/*" className="hidden" disabled={!canEdit || !!uploadingId}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(r.influencer_id, f); e.target.value = "" }} />
                        </label>
                        <input type="number" step="0.01" inputMode="decimal" disabled={!canEdit}
                          value={feeDraft[r.influencer_id] ?? ""}
                          onChange={(e) => setFeeDraft((p) => ({ ...p, [r.influencer_id]: e.target.value }))}
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right focus:border-zinc-900 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
                          placeholder="—" />
                      </div>
                      {invoicesByInf[r.influencer_id]?.length ? (
                        <div className="mt-0.5 text-right text-[10px] text-emerald-600">✓ {invoicesByInf[r.influencer_id].length} facture(s)</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.suggested_commission != null && (parseFloat(commDraft[r.influencer_id]) || 0) === 0 && (
                          <button type="button" disabled={!canEdit}
                            onClick={() => setCommDraft((p) => ({ ...p, [r.influencer_id]: String(r.suggested_commission) }))}
                            className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                            title="Appliquer la commission suggérée">
                            ≈ {formatCurrency(r.suggested_commission)}
                          </button>
                        )}
                        <input type="number" step="0.01" inputMode="decimal" disabled={!canEdit}
                          value={commDraft[r.influencer_id] ?? ""}
                          onChange={(e) => setCommDraft((p) => ({ ...p, [r.influencer_id]: e.target.value }))}
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right focus:border-zinc-900 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
                          placeholder="—" />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-zinc-900">
                      {rowTotal(r.influencer_id) > 0 ? formatCurrency(rowTotal(r.influencer_id)) : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-sm text-zinc-400">Aucune influenceuse ce mois-ci. Ajoutes-en une ci-dessous.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-50 font-semibold text-zinc-900">
                  <td className="px-3 py-2.5" colSpan={4}>Total à payer ce mois ({rows.length})</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* Ajouter une influenceuse (forfait sans ventes, nouvelle collab…) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 p-3">
            <Plus className="h-4 w-4 text-zinc-400" />
            <select defaultValue="" onChange={(e) => { addInfluencer(e.target.value); e.target.value = "" }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700">
              <option value="">Ajouter une influenceuse…</option>
              {notShown.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {!canEdit && <span className="text-xs text-amber-700">Mois verrouillé — édition réservée à l’admin.</span>}
          <button onClick={save} disabled={saving || !canEdit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Enregistrement…" : "Enregistrer les coûts"}
          </button>
        </div>
      </div>
    </div>
  )
}
