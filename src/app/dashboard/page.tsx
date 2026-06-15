"use client"

import { useEffect, useState, useCallback } from "react"
import { Header } from "@/components/layout/header"
import {
  CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw,
  Database, Copy, ChevronDown, ChevronRight, Key, Info, Hash,
} from "lucide-react"

interface ConnectorDoc {
  refresh_prompt: string
  how_to_refresh: string
  token_info?: string
}

interface Connector {
  id: string
  label: string
  source: string
  last_updated: string | null
  age_hours: number | null
  latest_period: string | null
  covers_through: string | null
  status: "ok" | "warning" | "broken"
  detail: string
  doc: ConnectorDoc
  counts?: Record<string, number>
}

interface ConnectorsResponse {
  generated_at: string
  yesterday: string
  cron: { ran_at: string | null; age_hours: number | null }
  connectors: Connector[]
}

function ago(hours: number | null): string {
  if (hours === null) return "jamais"
  if (hours < 1) return "à l’instant"
  if (hours < 48) return `il y a ${hours}h`
  return `il y a ${Math.round(hours / 24)} j`
}

const STATUS = {
  ok: { color: "text-emerald-700 bg-emerald-50 border-emerald-200", Icon: CheckCircle2, label: "À jour" },
  warning: { color: "text-amber-700 bg-amber-50 border-amber-200", Icon: AlertTriangle, label: "À surveiller" },
  broken: { color: "text-red-700 bg-red-50 border-red-200", Icon: XCircle, label: "Bloqué" },
}

const SYNC_ENDPOINTS: Record<string, string> = {
  shopify_orders: "/api/shopify/sync",
  meta_ads: "/api/meta/sync",
  google_ads: "/api/google/sync",
  klaviyo: "/api/klaviyo/sync",
  objectives: "/api/objectives/sync",
  calendar: "/api/calendar/sync",
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
    >
      <Copy className="h-3 w-3" />
      {copied ? "Copié !" : label}
    </button>
  )
}

function ConnectorCard({ c, onSync }: { c: Connector; onSync: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const st = STATUS[c.status]
  const hasSyncEndpoint = SYNC_ENDPOINTS[c.id]

  const handleSync = async () => {
    const endpoint = SYNC_ENDPOINTS[c.id]
    if (!endpoint) return
    setSyncing(true)
    try {
      const res = await fetch(endpoint, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Échec du sync ${c.label} : ${data.error || `HTTP ${res.status}`}`)
      }
      onSync(c.id)
    } catch {
      alert(`Échec du sync ${c.label} : erreur réseau ou délai dépassé.`)
      onSync(c.id)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-zinc-400" />
              <h3 className="font-semibold text-zinc-900">{c.label}</h3>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{c.source}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shrink-0 ${st.color}`}>
            <st.Icon className="h-3.5 w-3.5" /> {st.label}
          </span>
        </div>

        {/* Metrics row */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
          {c.last_updated && (
            <div>
              <span className="text-xs text-zinc-400">Dernière maj </span>
              <span className="text-zinc-700">{ago(c.age_hours)}</span>
            </div>
          )}
          {(c.covers_through || c.latest_period) && (
            <div>
              <span className="text-xs text-zinc-400">Période </span>
              <span className="text-zinc-700">{c.covers_through || c.latest_period}</span>
            </div>
          )}
          {c.counts && Object.entries(c.counts).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <Hash className="h-3 w-3 text-zinc-300" />
              <span className="text-xs text-zinc-500">{k.replace(/_/g, " ")}</span>
              <span className="text-xs font-semibold text-zinc-700">{v}</span>
            </div>
          ))}
        </div>

        <p className={`mt-2 text-sm ${c.status === "broken" ? "text-red-700" : c.status === "warning" ? "text-amber-700" : "text-zinc-500"}`}>
          {c.detail}
        </p>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasSyncEndpoint && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync…" : "Sync maintenant"}
            </button>
          )}
          <CopyButton text={c.doc.refresh_prompt} label="Copier le prompt Claude" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Doc
          </button>
        </div>
      </div>

      {/* Expanded doc */}
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-600">{c.doc.how_to_refresh}</p>
          </div>
          {c.doc.token_info && (
            <div className="flex items-start gap-2">
              <Key className="h-3.5 w-3.5 text-zinc-400 mt-0.5 shrink-0" />
              <p className="text-xs text-zinc-600">{c.doc.token_info}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SyncStep {
  key: string
  label: string
  status: "ok" | "error"
  detail: string
  ms: number
}

interface SyncAllResult {
  success: boolean
  duration_ms: number
  steps: SyncStep[]
}

function SyncAllPanel({ onDone }: { onDone: () => void }) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncAllResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/sync/all", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.steps)) {
        setResult(data as SyncAllResult)
      } else {
        setError(data.error || `HTTP ${res.status}`)
      }
      onDone()
    } catch {
      setError("Erreur réseau ou délai dépassé. La synchronisation a peut-être continué côté serveur — clique « Rafraîchir » dans quelques minutes.")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-900/10 bg-zinc-900 p-4 text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Tout synchroniser</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Shopify, codes, influenceurs, objectifs, Klaviyo, Google Ads, Meta, catalogue — en une fois (même code que le cron 7h).
          </p>
        </div>
        <button
          onClick={run}
          disabled={syncing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation…" : "Tout synchroniser"}
        </button>
      </div>

      {syncing && (
        <p className="mt-3 text-xs text-zinc-400">
          En cours — peut prendre 1 à 2 minutes (sources lentes : Klaviyo, Meta). Ne ferme pas l’onglet.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>
      )}

      {result && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-zinc-300">
            {result.success ? "Tout est à jour" : "Terminé avec des erreurs"} · {(result.duration_ms / 1000).toFixed(0)}s
          </p>
          {result.steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-xs">
              {s.status === "ok"
                ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
              <span className="text-zinc-300">
                <span className="font-medium text-white">{s.label}</span>
                {" — "}{s.detail}
                <span className="text-zinc-500"> ({(s.ms / 1000).toFixed(1)}s)</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<ConnectorsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/connectors")
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title="Connecteurs & données"
        subtitle="Santé des sources, documentation et actions"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
          </button>
        }
      />

      <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : !data ? (
          <p className="text-red-600">Impossible de charger les connecteurs.</p>
        ) : (
          <>
            <SyncAllPanel onDone={() => setTimeout(load, 1000)} />

            {data.cron.ran_at && (
              <p className="text-xs text-zinc-400 text-center">
                Dernier cron : {ago(data.cron.age_hours)}
              </p>
            )}

            <div className="space-y-3">
              {data.connectors.map((c) => (
                <ConnectorCard key={c.id} c={c} onSync={() => setTimeout(load, 1000)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
