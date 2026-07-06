"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Mail, RefreshCw, Send, Eye, CheckCircle2, AlertTriangle, MessageCircle } from "lucide-react"
import { ConversationDrawer } from "@/components/influence/conversation-drawer"

interface OutreachState {
  status: string; step: number; sent: Record<string, string>
  email_status?: string; personalisation?: string; replied_at?: string; reply_summary?: string
}
interface Row {
  id: string; name: string; instagram_handle: string | null; email: string | null
  tier: string | null; category: string | null; outreach: OutreachState; due: number | null
}
interface Data { market: string; configured: boolean; total: number; due: number; counts: Record<string, number>; rows: Row[] }
interface SendResult { name: string; email: string | null; step?: number; result: string; detail?: string }

const STATUSES = ["À contacter", "À qualifier", "Étape 1 envoyée", "Étape 2 envoyée", "Étape 3 envoyée", "Répondu", "Intéressée", "Pas intéressée", "Bounce", "Désinscrit", "Exclu"]

const statusColor = (s: string) =>
  s === "Répondu" || s === "Intéressée" ? "bg-emerald-100 text-emerald-700"
  : s === "Pas intéressée" || s === "Bounce" || s === "Désinscrit" || s === "Exclu" ? "bg-zinc-200 text-zinc-500"
  : s === "À qualifier" ? "bg-amber-100 text-amber-700"
  : s.startsWith("Étape") ? "bg-blue-100 text-blue-700"
  : "bg-zinc-100 text-zinc-700"

export default function OutreachPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SendResult[] | null>(null)
  const [note, setNote] = useState<string>("")
  const [convId, setConvId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/influencers/outreach?market=UK")
      setData(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const runSend = async (dry: boolean) => {
    if (!dry && !confirm("Envoyer pour de vrai l'étape due à tous les contacts éligibles (lot warm-up) ?")) return
    setBusy(true); setResults(null); setNote("")
    try {
      const res = await fetch("/api/influencers/outreach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", market: "UK", dry, max: dry ? 100 : 10 }),
      })
      const j = await res.json()
      if (!res.ok) { setNote(j.error || "Erreur"); return }
      setResults(j.results || [])
      setNote(`${dry ? "Aperçu (DRY)" : "Envoi réel"} : ${j.sent} email(s) ${dry ? "à envoyer" : "envoyés"} sur ${j.attempted} examinés.`)
      if (!dry) load()
    } finally { setBusy(false) }
  }

  const sendOne = async (id: string, name: string) => {
    if (!confirm(`Envoyer POUR DE VRAI l'étape due à ${name} ? (1 email)`)) return
    setBusy(true); setNote("")
    try {
      const res = await fetch("/api/influencers/outreach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: "UK", dry: false, ids: [id], max: 1 }),
      })
      const j = await res.json()
      setNote(res.ok ? `Envoi à ${name} : ${j.results?.[0]?.result || "?"}` : (j.error || "Erreur"))
      load()
    } finally { setBusy(false) }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch("/api/influencers/outreach", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    })
    load()
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">🇬🇧 Outreach UK — Influence</h1>
          <p className="text-sm text-zinc-500">Prospection email entonnoir-ouvert · drip J0 / J+4 / J+9 · envoi Resend (companion-ecommerce.com)</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
          <RefreshCw className="h-4 w-4" /> Rafraîchir
        </button>
      </div>

      {/* Bandeau config Resend */}
      {data && (
        <div className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${data.configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {data.configured ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {data.configured
            ? "Resend configuré — l'envoi réel est possible (DRY recommandé d'abord)."
            : "Resend non configuré (RESEND_API_KEY + OUTREACH_FROM sur companion-ecommerce.com). Aperçu DRY uniquement pour l'instant."}
        </div>
      )}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Contacts UK", value: data?.total ?? 0 },
          { label: "À envoyer (dus)", value: data?.due ?? 0 },
          { label: "Répondu", value: (data?.counts["Répondu"] ?? 0) + (data?.counts["Intéressée"] ?? 0) },
          { label: "À qualifier", value: data?.counts["À qualifier"] ?? 0 },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => runSend(true)} disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Aperçu DRY (étape due)
        </button>
        <button onClick={() => runSend(false)} disabled={busy || !data?.configured}
          title={!data?.configured ? "Resend non configuré" : ""}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40">
          <Send className="h-4 w-4" /> Envoyer l&apos;étape due (réel · lot 10)
        </button>
        {note && <span className="text-sm text-zinc-600">{note}</span>}
      </div>

      {/* Résultats DRY / envoi */}
      {results && results.length > 0 && (
        <div className="mb-5 max-h-56 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <Mail className="h-3 w-3 text-zinc-400" />
              <span className={`rounded px-1.5 py-0.5 font-medium ${r.result === "sent" ? "bg-emerald-100 text-emerald-700" : r.result === "dry" ? "bg-blue-100 text-blue-700" : r.result === "error" ? "bg-red-100 text-red-700" : "bg-zinc-200 text-zinc-500"}`}>{r.result}{r.step ? ` · ét.${r.step}` : ""}</span>
              <span className="font-medium text-zinc-800">{r.name}</span>
              <span className="text-zinc-400">{r.email}</span>
              {r.detail && <span className="text-red-500">{r.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Table contacts */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Créatrice</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Niche</th>
              <th className="px-3 py-2.5">Tier</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5">Due</th>
              <th className="px-3 py-2.5">Dernier envoi</th>
              <th className="px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(data?.rows ?? []).map((r) => {
              const lastStep = r.outreach.step
              const lastSent = lastStep ? r.outreach.sent[String(lastStep)] : null
              const srcAg = (r.outreach.email_status || "").toLowerCase()
              return (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-zinc-900">{r.name}</div>
                    <div className="text-xs text-zinc-400">{r.instagram_handle}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.email ? <span className="text-zinc-700">{r.email}</span> : <span className="text-amber-600">à sourcer</span>}
                    {srcAg && <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">{srcAg}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{r.category}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{r.tier}</td>
                  <td className="px-3 py-2.5">
                    <select value={r.outreach.status} onChange={(e) => patch(r.id, { status: e.target.value })}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${statusColor(r.outreach.status)}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">{r.due ? <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-bold text-white">ét.{r.due}</span> : <span className="text-zinc-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">{lastSent ? new Date(lastSent).toLocaleDateString("fr-FR") : "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => sendOne(r.id, r.name)} disabled={busy || !r.due || !r.email || !data?.configured}
                        title={!r.email ? "email à sourcer" : !r.due ? "rien de dû" : !data?.configured ? "mail non configuré" : "Envoyer (réel · 1 email)"}
                        className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-30">
                        <Send className="h-3 w-3" /> Envoyer
                      </button>
                      <button onClick={() => setConvId(r.id)} title="Voir la conversation"
                        className="rounded-md border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ConversationDrawer influencerId={convId} onClose={() => setConvId(null)} />
    </div>
  )
}
