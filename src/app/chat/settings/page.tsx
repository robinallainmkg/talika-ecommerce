"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"

type BusinessHours = { timezone: string; days: number[]; start: string; end: string }

const DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
]

export default function ChatSettingsPage() {
  const [botEnabled, setBotEnabled] = useState(true)
  const [questions, setQuestions] = useState("")
  const [hours, setHours] = useState<BusinessHours>({ timezone: "Europe/Paris", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" })
  const [offlineMessage, setOfflineMessage] = useState("")
  const [dailyLimit, setDailyLimit] = useState(20)
  const [addendum, setAddendum] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/chat/admin/settings")
      const data = await res.json()
      const s = data.settings || {}
      setBotEnabled(s.bot_enabled !== false)
      setQuestions(Array.isArray(s.suggested_questions) ? s.suggested_questions.join("\n") : "")
      if (s.business_hours) setHours(s.business_hours as BusinessHours)
      setOfflineMessage(typeof s.offline_message === "string" ? s.offline_message : "")
      setDailyLimit(Number(s.daily_limit) || 20)
      setAddendum(typeof s.prompt_addendum === "string" ? s.prompt_addendum : "")
      setWhatsapp(typeof s.whatsapp_number === "string" ? s.whatsapp_number : "")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    const entries: Array<[string, unknown]> = [
      ["bot_enabled", botEnabled],
      ["suggested_questions", questions.split("\n").map((q) => q.trim()).filter(Boolean)],
      ["business_hours", hours],
      ["offline_message", offlineMessage],
      ["daily_limit", dailyLimit],
      ["prompt_addendum", addendum],
      ["whatsapp_number", whatsapp],
    ]
    for (const [key, value] of entries) {
      await adminFetch("/api/chat/admin/settings", { method: "PUT", body: JSON.stringify({ key, value }) })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="p-8 text-sm text-zinc-400">Chargement…</div>

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/chat" className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Réglages du chat</h1>
          <p className="text-sm text-zinc-500">Comportement du bot et du widget</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Bot activé</h2>
            <p className="text-xs text-zinc-500">Kill switch — désactivé, le chat propose uniquement de laisser un message</p>
          </div>
          <button
            onClick={() => setBotEnabled(!botEnabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${botEnabled ? "bg-emerald-500" : "bg-zinc-200"}`}
            aria-label="Activer ou désactiver le bot"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${botEnabled ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Questions suggérées</h2>
          <p className="mb-3 text-xs text-zinc-500">Affichées en début de conversation — une par ligne</p>
          <textarea
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Horaires de présence (Europe/Paris)</h2>
          <p className="mb-3 text-xs text-zinc-500">Le bot répond 24/7 — hors horaires, les escalades affichent le message ci-dessous</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.value}
                onClick={() =>
                  setHours((h) => ({
                    ...h,
                    days: h.days.includes(d.value) ? h.days.filter((x) => x !== d.value) : [...h.days, d.value],
                  }))
                }
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  hours.days.includes(d.value) ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <input
              type="time"
              value={hours.start}
              onChange={(e) => setHours((h) => ({ ...h, start: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-2 py-1.5"
            />
            <span className="text-zinc-400">à</span>
            <input
              type="time"
              value={hours.end}
              onChange={(e) => setHours((h) => ({ ...h, end: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-2 py-1.5"
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Message hors ligne</h2>
          <textarea
            value={offlineMessage}
            onChange={(e) => setOfflineMessage(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Limite quotidienne</h2>
            <p className="mb-3 text-xs text-zinc-500">Messages bot / jour / visiteur</p>
            <input
              type="number"
              min={1}
              max={200}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="w-24 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Numéro WhatsApp</h2>
            <p className="mb-3 text-xs text-zinc-500">Pour la bascule WhatsApp (V2)</p>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="33612345678"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Addendum au prompt système</h2>
          <p className="mb-3 text-xs text-zinc-500">Consignes complémentaires données au bot (ton, priorités du moment…)</p>
          <textarea
            value={addendum}
            onChange={(e) => setAddendum(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-zinc-400 focus:outline-none"
          />
        </div>

        <button
          onClick={save}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" /> Enregistré
            </>
          ) : (
            "Enregistrer"
          )}
        </button>
      </div>
    </div>
  )
}
