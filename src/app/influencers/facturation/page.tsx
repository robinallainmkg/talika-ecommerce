"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { cn, formatCurrency } from "@/lib/utils"
import { MonthTabs } from "@/components/influence/month-tabs"
import { usePeriod } from "@/components/influence/use-period"
import { Header } from "@/components/layout/header"
import { InfluencerDrawer } from "@/components/influence/influencer-drawer"
import { Loader2, Paperclip, FileText, Check, Lock, Sparkles, ExternalLink, Bell, Trash2 } from "lucide-react"
import { authClient } from "@/lib/auth/client"

interface Invoice {
  id: string
  file_name: string
  amount: number | null
}
type BillingStatus = "a_regler" | "reporte" | "paye" | "sans_facturation"
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
  status: BillingStatus
  deferred_to: { year: number; month: number } | null
  note: string | null
}
interface ReportIn { influencer_id: string; name: string; from_year: number; from_month: number; amount: number }

const STATUS_META: Record<BillingStatus, { label: string; cls: string }> = {
  a_regler: { label: "À régler", cls: "bg-zinc-100 text-zinc-700" },
  reporte: { label: "Reporté", cls: "bg-amber-100 text-amber-800" },
  paye: { label: "Payé", cls: "bg-emerald-100 text-emerald-700" },
  sans_facturation: { label: "Sans facturation", cls: "bg-zinc-200 text-zinc-500" },
}

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
]

export default function FacturationPage() {
  const now = new Date()
  // Période mémorisée : URL (?year=&month=) + partagée entre vues influence.
  const { year, setYear, month, setMonth } = usePeriod()
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [totals, setTotals] = useState({ count: 0, total_due: 0, with_invoice: 0 })
  const [reportsIn, setReportsIn] = useState<ReportIn[]>([])
  const [reportsInTotal, setReportsInTotal] = useState(0)
  const [excluded, setExcluded] = useState({ count: 0, amount: 0 })
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)
  const [billingDraft, setBillingDraft] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [lock, setLock] = useState<{ locked_by: string | null; locked_at: string } | null>(null)
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [missingByMonth, setMissingByMonth] = useState<Record<number, number>>({})
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const isAdmin = role === "admin"
  const isLocked = !!lock
  // Le verrou de mois fige les MONTANTS, pas les documents : joindre/retirer une
  // facture reste possible après clôture. Seul "sans facturation" est gelé (il
  // sort la collab des coûts du mois) — cf. /api/influencers/billing/status.
  const excludeFrozen = isLocked && !isAdmin

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
      const [res, lockRes, sumRes] = await Promise.all([
        fetch(`/api/influencers/billing?year=${year}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/influencers/lock?year=${year}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/influencers/billing/summary?year=${year}`, { cache: "no-store" }),
      ])
      const data = await res.json()
      const lockData = await lockRes.json()
      setLock(lockData.locked ? lockData.lock : null)
      const list: Collab[] = data.collabs || []
      setCollabs(list)
      setTotals(data.totals || { count: 0, total_due: 0, with_invoice: 0 })
      setReportsIn(data.reports_in || [])
      setReportsInTotal(data.reports_in_total || 0)
      setExcluded({ count: data.totals?.excluded_count || 0, amount: data.totals?.excluded_amount || 0 })
      const bd: Record<string, string> = {}
      for (const c of list) bd[c.influencer_id] = c.billing_name || ""
      setBillingDraft(bd)
      const sum = await sumRes.json()
      const mb: Record<number, number> = {}
      for (const mo of sum.months || []) mb[mo.month] = mo.missing
      setMissingByMonth(mb)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  // Au 1er chargement : ouvrir sur le mois le plus récent qui a des collabs
  // (sinon la page s'ouvre sur le mois courant, souvent vide → impression que
  // tout manque). On balaie l'année courante puis les 2 précédentes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ty = new Date().getFullYear()
      for (const y of [ty, ty - 1, ty - 2]) {
        try {
          const res = await fetch(`/api/influencers/billing/summary?year=${y}`, { cache: "no-store" })
          const data = await res.json()
          const withData = (data.months || []).filter((m: { count: number }) => m.count > 0)
          if (!cancelled && withData.length) {
            setYear(y)
            setMonth(withData[withData.length - 1].month)
            setInitialized(true)
            return
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setInitialized(true)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (initialized) load() }, [load, initialized])

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

  async function deleteInvoice(c: Collab, inv: Invoice) {
    if (!window.confirm(`Supprimer la facture « ${inv.file_name} » ?\n\nLe coût du mois (forfait / commission) n'est pas modifié.`)) return
    // Maj optimiste + recalcul des KPI dépendant de la présence de facture.
    const next = collabs.map((cc) => {
      if (cc.influencer_id !== c.influencer_id) return cc
      const invoices = cc.invoices.filter((i) => i.id !== inv.id)
      return { ...cc, invoices, has_invoice: invoices.length > 0 }
    })
    setCollabs(next)
    const active = next.filter((x) => x.status !== "sans_facturation")
    setTotals((t) => ({ ...t, with_invoice: active.filter((x) => x.has_invoice).length }))
    setMissingByMonth((mb) => ({ ...mb, [month]: next.filter((x) => x.status === "a_regler" && !x.has_invoice).length }))
    const res = await fetch("/api/influencers/invoices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: inv.id }),
    })
    if (!res.ok) {
      setFeedback({ type: "error", text: "Suppression impossible — actualise la page." })
      load()
    }
  }

  const defaultNextMonth = () => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })

  async function setStatus(c: Collab, status: BillingStatus, deferred_to?: { year: number; month: number }) {
    if (
      status === "sans_facturation" &&
      !window.confirm(
        `Marquer « ${c.name} » SANS FACTURATION ?\n\nSon coût (${formatCurrency(c.total_due)}) sortira du total, des alertes et des dashboards (MER, scoreboard). C'est réversible (repasse en « à régler »).`
      )
    ) return
    setStatusSavingId(c.influencer_id)
    setFeedback(null)
    try {
      const res = await fetch("/api/influencers/billing/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: c.influencer_id, year, month, status, deferred_to: deferred_to || null }),
      })
      if (res.status === 423) {
        setFeedback({ type: "error", text: "Mois verrouillé — seul un admin peut changer le statut." })
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFeedback({ type: "error", text: d.error || "Changement de statut impossible." })
        return
      }
      // Mise à jour optimiste (pas de rechargement de page) + recalcul des KPI côté client.
      const next = collabs.map((cc) =>
        cc.influencer_id === c.influencer_id ? { ...cc, status, deferred_to: deferred_to || null } : cc
      )
      setCollabs(next)
      const active = next.filter((x) => x.status !== "sans_facturation")
      setTotals({
        count: active.length,
        total_due: Math.round(active.reduce((s, x) => s + x.total_due, 0) * 100) / 100,
        with_invoice: active.filter((x) => x.has_invoice).length,
      })
      const exc = next.filter((x) => x.status === "sans_facturation")
      setExcluded({ count: exc.length, amount: Math.round(exc.reduce((s, x) => s + x.total_due, 0) * 100) / 100 })
      setMissingByMonth((mb) => ({ ...mb, [month]: next.filter((x) => x.status === "a_regler" && !x.has_invoice).length }))
    } finally {
      setStatusSavingId(null)
    }
  }

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
  const isMissing = (c: Collab) => c.status === "a_regler" && !c.has_invoice
  const missingCount = collabs.filter(isMissing).length
  const visibleCollabs = onlyMissing ? collabs.filter(isMissing) : collabs

  return (
    <div>
      <Header
        title="Facturation"
        subtitle="Les collabs à régler ce mois — joins la facture et garde le bon libellé de facturation."
      />
      <div className="space-y-6 p-8">
        <div className="space-y-4">
          {/* Période : mois + année */}
          <MonthTabs month={month} onSelect={(m) => m && setMonth(m)} badges={missingByMonth} year={year} onYearChange={setYear} years={years} />
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <Lock className="h-4 w-4" /> Mois verrouillé{lock?.locked_by ? ` par ${lock.locked_by}` : ""} : les montants sont figés.
          {isAdmin
            ? " Tu peux tout modifier (admin)."
            : " Tu peux toujours joindre les factures et suivre les paiements."}
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

      {missingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2 font-medium text-amber-800">
            <Bell className="h-4 w-4" />
            {missingCount} collab{missingCount > 1 ? "s" : ""} sans facture ce mois — à demander / relancer.
          </span>
          <button
            onClick={() => setOnlyMissing((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              onlyMissing
                ? "border-amber-400 bg-amber-100 text-amber-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            )}
          >
            {onlyMissing ? "Voir toutes" : "Sans facture seulement"}
          </button>
        </div>
      )}

      {reportsIn.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm">
          <span className="font-medium text-amber-800">
            Reste à payer (reporté vers {MONTHS[month - 1]}) : {formatCurrency(reportsInTotal)}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-700">
            {reportsIn.map((r) => (
              <span
                key={r.influencer_id + r.from_year + r.from_month}
                title={`Reporté depuis ${MONTHS[r.from_month - 1]} ${r.from_year} — ${formatCurrency(r.amount)}`}
                className="cursor-help border-b border-dashed border-amber-300"
              >
                {r.name} : {formatCurrency(r.amount)}{" "}
                <span className="text-amber-500">(depuis {MONTHS_SHORT[r.from_month - 1]})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {excluded.count > 0 && (
        <p className="text-xs text-zinc-400">
          {excluded.count} collab{excluded.count > 1 ? "s" : ""} « sans facturation » exclue{excluded.count > 1 ? "s" : ""} du
          total et des dashboards (− {formatCurrency(excluded.amount)}).
        </p>
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
        ) : visibleCollabs.length === 0 ? (
          <div className="p-10 text-center text-sm text-emerald-600">
            Toutes les collabs de {MONTHS[month - 1]} {year} ont leur facture ✓
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                <th className="px-4 py-3">Collab</th>
                <th className="px-4 py-3">Libellé de facturation</th>
                <th className="px-4 py-3 text-right">Montant dû</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Facture</th>
              </tr>
            </thead>
            <tbody>
              {visibleCollabs.map((c) => {
                const showSuggestion =
                  c.ocr_supplier && c.ocr_supplier.trim() && (billingDraft[c.influencer_id] || "").trim() !== c.ocr_supplier.trim()
                return (
                  <tr key={c.influencer_id} className={cn(
                    "border-b border-zinc-100 align-top",
                    isMissing(c) && "bg-amber-50/40",
                    c.status === "sans_facturation" && "opacity-60"
                  )}>
                    {/* Collab */}
                    <td className="px-4 py-3">
                      <button onClick={() => setDrawerId(c.influencer_id)} className="text-left font-medium text-zinc-900 hover:underline">
                        {c.name}
                      </button>
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

                    {/* Statut */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={c.status}
                            disabled={
                              statusSavingId === c.influencer_id ||
                              (excludeFrozen && c.status === "sans_facturation")
                            }
                            onChange={(e) => {
                              const v = e.target.value as BillingStatus
                              if (v === "reporte") setStatus(c, "reporte", c.deferred_to || defaultNextMonth())
                              else setStatus(c, v)
                            }}
                            className={cn(
                              "rounded-lg border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-300 disabled:opacity-50",
                              STATUS_META[c.status].cls
                            )}
                          >
                            <option value="a_regler">À régler</option>
                            <option value="reporte">Reporté</option>
                            <option value="paye">Payé</option>
                            <option value="sans_facturation" disabled={excludeFrozen}>
                              Sans facturation{excludeFrozen ? " (mois verrouillé)" : ""}
                            </option>
                          </select>
                          {statusSavingId === c.influencer_id && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
                        </div>
                        {c.status === "reporte" && (
                          <select
                            value={c.deferred_to?.month || ""}
                            onChange={(e) => {
                              const tm = Number(e.target.value)
                              const ty = tm <= month ? year + 1 : year
                              setStatus(c, "reporte", { year: ty, month: tm })
                            }}
                            title="Mois de paiement cible"
                            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
                          >
                            {MONTHS.map((mn, i) => <option key={i} value={i + 1}>→ {mn}</option>)}
                          </select>
                        )}
                      </div>
                    </td>

                    {/* Facture */}
                    <td className="px-4 py-3">
                      {c.invoices.length > 0 ? (
                        <div className="space-y-1">
                          {c.invoices.map((inv) => (
                            <div key={inv.id} className="flex items-center gap-1.5">
                              <button onClick={() => viewInvoice(inv.id)}
                                className="flex min-w-0 items-center gap-1.5 text-xs text-emerald-700 hover:underline">
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="max-w-[160px] truncate">{inv.file_name}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400" />
                              </button>
                              <button onClick={() => deleteInvoice(c, inv)} title="Supprimer la facture"
                                className="shrink-0 text-zinc-300 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-700">
                            <Paperclip className="h-3 w-3" /> remplacer / ajouter
                            <input type="file" accept=".pdf,image/*" className="hidden"
                              disabled={!!uploadingId}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(c.influencer_id, f); e.target.value = "" }} />
                          </label>
                        </div>
                      ) : (
                        <label className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                          !uploadingId
                            ? "cursor-pointer border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                            : "cursor-not-allowed border-zinc-200 text-zinc-300"
                        }`}>
                          {uploadingId === c.influencer_id ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lecture…</>
                          ) : (
                            <><Paperclip className="h-3.5 w-3.5" /> Joindre la facture</>
                          )}
                          <input type="file" accept=".pdf,image/*" className="hidden"
                            disabled={!!uploadingId}
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

      <InfluencerDrawer influencerId={drawerId} onClose={() => setDrawerId(null)} />
      </div>
    </div>
  )
}
