"use client"

import { useEffect, useState, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, Clock, Database } from "lucide-react"

interface Connector {
  id: string
  label: string
  source: string
  realtime: boolean
  last_updated: string | null
  age_hours: number | null
  latest_period: string | null
  covers_through: string | null
  covers_yesterday: boolean | null
  status: "ok" | "warning" | "broken"
  detail: string
}

interface CronStep {
  line: string
  failed: boolean
}

interface ConnectorsResponse {
  generated_at: string
  yesterday: string
  cron: {
    ran_at: string | null
    age_hours: number | null
    orders_count: number | null
    failed_count: number
    steps: CronStep[]
  }
  connectors: Connector[]
}

function ago(hours: number | null): string {
  if (hours === null) return "jamais"
  if (hours < 1) return "à l'instant"
  if (hours < 48) return `il y a ${hours}h`
  return `il y a ${Math.round(hours / 24)} j`
}

const STATUS = {
  ok: { color: "text-emerald-700 bg-emerald-50 border-emerald-200", Icon: CheckCircle2, label: "À jour" },
  warning: { color: "text-amber-700 bg-amber-50 border-amber-200", Icon: AlertTriangle, label: "À surveiller" },
  broken: { color: "text-red-700 bg-red-50 border-red-200", Icon: XCircle, label: "Bloqué" },
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

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header
        title="Connecteurs & données"
        subtitle="Santé des sources : à jour ou pas, jusqu'à quelle date"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Rafraîchir
          </button>
        }
      />

      <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : !data ? (
          <p className="text-red-600">Impossible de charger l&apos;état des connecteurs.</p>
        ) : (
          <>
            {/* ── Cron banner ── */}
            <div
              className={`rounded-xl border p-4 ${
                data.cron.failed_count > 0
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Clock className="h-4 w-4" />
                Sync automatique (cron 7h Paris) — {ago(data.cron.age_hours)}
                {data.cron.failed_count > 0 && (
                  <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    {data.cron.failed_count} en échec
                  </span>
                )}
              </div>
              {data.cron.steps.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {data.cron.steps.map((s, i) => (
                    <li key={i} className={`flex items-start gap-1.5 ${s.failed ? "text-red-700" : "text-emerald-700"}`}>
                      {s.failed ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      <span className="font-mono">{s.line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Connectors list ── */}
            <div className="space-y-3">
              {data.connectors.map((c) => {
                const st = STATUS[c.status]
                return (
                  <div key={c.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-zinc-400" />
                          <h3 className="font-semibold text-zinc-900">{c.label}</h3>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">{c.source}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${st.color}`}>
                        <st.Icon className="h-3.5 w-3.5" /> {st.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                      <div>
                        <div className="text-xs text-zinc-400">Type</div>
                        <div className="text-zinc-700">{c.realtime ? "Temps réel" : "Cache"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Dernière maj</div>
                        <div className="text-zinc-700">{ago(c.age_hours)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-400">Période couverte</div>
                        <div className="text-zinc-700">
                          {c.covers_through || c.latest_period || "—"}
                        </div>
                      </div>
                    </div>

                    <p className={`mt-3 text-sm ${c.status === "broken" ? "text-red-700" : c.status === "warning" ? "text-amber-700" : "text-zinc-500"}`}>
                      {c.detail}
                    </p>
                  </div>
                )
              })}
            </div>

            <p className="text-center text-xs text-zinc-400">
              Toutes les sources sont en cache (aucune temps réel). « Période couverte » = donnée la plus récente réellement présente.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
