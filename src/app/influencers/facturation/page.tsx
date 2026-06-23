"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { Loader2, ArrowLeft, RefreshCw, Paperclip, FileText, Check, Lock, Sparkles, ExternalLink } from "lucide-react"
import { authClient } from "@/lib/auth/client"

interface Invoice {
  id: string
  file_name: string
  amount: number | null
}
interface Collab {
  influencer_id: string
  name: string
  instagram_handle: string | null
  billing_name: string | null
  ocr_supplier: string | null
  fixed_fee: number
  commission: number
  total_due: number
  invoices: Invoice[]
  has_invoice: boolean
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

export default function FacturationPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [totals, setTotals] = useState({ count: 0, total_due: 0, with_invoice: 0 })
  const [billingDraft, setBillingDraft] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lock, setLock] = useState<{ locked_by: string | null; locked_at: string } | null>(null)
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  const isAdmin = role === "admin"
  const isLocked = !!lock
  const canUpload = !isLocked || isAdmin

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
      const [res, lockRes] = await Promise.all([
        fetch(`/api/influencers/billing?year=${year}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/influencers/lock?year=${year}&month=${month}`, { cache: "no-store" }),
      ])
      const data = await res.json()
      const lockData = await lockRes.json()
      setLock(lockData.locked ? lockData.lock : null)
      const list: Collab[] = data.collabs || []
      setCollabs(list)
      setTotals(data.totals || { count: 0, total_due: 0, with_invoice: 0 })
      const bd: Record<string, string> = {}
      for (const c of list) bd[c.influencer_id] = c.billing_name || ""
      setBillingDraft(bd)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  async function saveBilling(influencerId: string, value: string) {
    const current = collabs.find((c) => c.influencer_id === influencerId)?.billing_name || ""
    if (value.trim() === current.trim()) return
    setSavingId(influencerId)
    try {
      await fetch("/api/influencers/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: influencerId, billing_name: value }),
      })
      setCollabs((prev) => prev.map((c) => (c.influencer_id === influencerId ? { ...c, billing_name: value.trim() || null } : c)))
    } finally {
      setSavingId(null)
    }
  }

  function applySuggestion(influencerId: string, supplier: string) {
    setBillingDraft((p) => ({ ...p, [influencerId]: supplier }))
    saveBilling(influencerId, supplier)
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
      const bits: string[] = []
      if (ocr.amount != null) bits.push(`${ocr.amount} €`)
      if (ocr.supplier) bits.push(`émetteur « ${ocr.supplier} »`)
      setFeedback({
        type: "ok",
        text: bits.length ? `Facture lue : ${bits.join(" · ")}.` : "Facture jointe (rien détecté automatiquement).",
      })
      await load()
    } catch {
      setFeedback({ type: "error", text: "Erreur réseau pendant l'upload." })
    } finally {
      setUploadingId(null)
    }
  }

  async function viewInvoice(invoiceId: string) {
    const res = await fetch("/api/influencers/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invoiceId }),
    })
    const data = await res.json()
    if (data.url) window.open(data.url, "_blank")
  }

  const years = [now.getFullYear(), now.getFullYear() - 1]

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/influencers" className="mb-1 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Influence
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900">Facturation</h1>
          <p className="text-sm text-zinc-500">
            Les collabs à régler ce mois (un paiement dû = une collab). Joins la facture et garde le bon libellé de facturation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
        </div>
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" /> Mois verrouillé{lock?.locked_by ? ` par ${lock.locked_by}` : ""}.
          {isAdmin ? " (admin : tu peux encore joindre des factures)" : " Les factures ne peuvent plus être modifiées."}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Collabs à régler</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{totals.count}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Total à régler</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{formatCurrency(totals.total_due)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Factures reçues</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {totals.with_invoice}<span className="text-base font-normal text-zinc-400">/{totals.count}</span>
          </p>
        </div>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>{feedback.text}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : collabs.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            Aucune collab à régler pour {MONTHS[month - 1]} {year}.
            <br />
            <span className="text-zinc-400">Les montants (forfait / commission) se saisissent dans </span>
            <Link href="/influencers/couts" className="text-zinc-700 underline">Coûts influence</Link>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-4 py-3">Collab</th>
                <th className="px-4 py-3">Libellé de facturation</th>
                <th className="px-4 py-3 text-right">Montant dû</th>
                <th className="px-4 py-3">Facture</th>
              </tr>
            </thead>
            <tbody>
              {collabs.map((c) => {
                const showSuggestion =
                  c.ocr_supplier && c.ocr_supplier.trim() && (billingDraft[c.influencer_id] || "").trim() !== c.ocr_supplier.trim()
                return (
                  <tr key={c.influencer_id} className="border-b border-zinc-100 align-top">
                    {/* Collab */}
                    <td className="px-4 py-3">
                      <Link href={`/influencers/${c.influencer_id}`} className="font-medium text-zinc-900 hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-zinc-400">
                        {c.instagram_handle ? `@${c.instagram_handle.replace(/^@/, "")}` : "—"}
                      </div>
                    </td>

                    {/* Libellé de facturation */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={billingDraft[c.influencer_id] ?? ""}
                          onChange={(e) => setBillingDraft((p) => ({ ...p, [c.influencer_id]: e.target.value }))}
                          onBlur={(e) => saveBilling(c.influencer_id, e.target.value)}
                          placeholder="Raison sociale / nom sur la facture"
                          className="w-56 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
                        />
                        {savingId === c.influencer_id && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                      </div>
                      {showSuggestion && (
                        <button
                          onClick={() => applySuggestion(c.influencer_id, c.ocr_supplier!)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
                          title="Nom lu sur la facture par l'OCR">
                          <Sparkles className="h-3 w-3" /> Utiliser « {c.ocr_supplier} »
                        </button>
                      )}
                    </td>

                    {/* Montant dû */}
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold text-zinc-900">{formatCurrency(c.total_due)}</div>
                      <div className="text-[11px] text-zinc-400">
                        {c.fixed_fee > 0 && <span>forfait {formatCurrency(c.fixed_fee)}</span>}
                        {c.fixed_fee > 0 && c.commission > 0 && " · "}
                        {c.commission > 0 && <span>comm. {formatCurrency(c.commission)}</span>}
                      </div>
                    </td>

                    {/* Facture */}
                    <td className="px-4 py-3">
                      {c.invoices.length > 0 ? (
                        <div className="space-y-1">
                          {c.invoices.map((inv) => (
                            <button key={inv.id} onClick={() => viewInvoice(inv.id)}
                              className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
                              <Check className="h-3.5 w-3.5" />
                              <FileText className="h-3.5 w-3.5" />
                              <span className="max-w-[160px] truncate">{inv.file_name}</span>
                              <ExternalLink className="h-3 w-3 text-zinc-400" />
                            </button>
                          ))}
                          {canUpload && (
                            <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700">
                              <Paperclip className="h-3 w-3" /> remplacer / ajouter
                              <input type="file" accept=".pdf,image/*" className="hidden"
                                disabled={!!uploadingId}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(c.influencer_id, f); e.target.value = "" }} />
                            </label>
                          )}
                        </div>
                      ) : (
                        <label className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                          canUpload && !uploadingId
                            ? "cursor-pointer border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                            : "cursor-not-allowed border-zinc-200 text-zinc-300"
                        }`}>
                          {uploadingId === c.influencer_id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lecture…</>
                          ) : (
                            <><Paperclip className="h-3.5 w-3.5" /> Joindre la facture</>
                          )}
                          <input type="file" accept=".pdf,image/*" className="hidden"
                            disabled={!canUpload || !!uploadingId}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(c.influencer_id, f); e.target.value = "" }} />
                        </label>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        Les montants (forfait / commission) se saisissent dans{" "}
        <Link href="/influencers/couts" className="underline">Coûts influence</Link>. Ici tu suis la facturation : libellé
        (raison sociale, pré-suggérée par l&apos;OCR de la facture) et facture reçue.
      </p>
    </div>
  )
}
