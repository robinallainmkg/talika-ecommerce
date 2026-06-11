"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Send } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { streamChatMessage, SseDebug } from "@/lib/chat/sse-client"

type PlaygroundMessage = {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}

export default function PlaygroundPage() {
  const [token, setToken] = useState<string | null>(null)
  const [messages, setMessages] = useState<PlaygroundMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [debug, setDebug] = useState<SseDebug | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const newSession = useCallback(async () => {
    setMessages([])
    setDebug(null)
    setError(null)
    try {
      const res = await adminFetch("/api/chat/admin/playground", { method: "POST" })
      const data = await res.json()
      setToken(data.token)
    } catch {
      setError("Impossible de créer la session")
    }
  }, [])

  useEffect(() => {
    newSession()
  }, [newSession])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send() {
    const message = input.trim()
    if (!message || !token || busy) return
    setInput("")
    setBusy(true)
    setError(null)
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "", streaming: true }])

    await streamChatMessage({
      token,
      message,
      debug: true,
      onDelta: (text) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role !== "assistant") return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + text }]
        })
      },
      onDone: (done) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role !== "assistant") return prev
          return [...prev.slice(0, -1), { ...last, streaming: false }]
        })
        if (done.debug) setDebug(done.debug)
        setBusy(false)
      },
      onError: (msg) => {
        setError(msg)
        setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.content === "")))
        setBusy(false)
      },
    })
  }

  return (
    <div className="flex h-screen flex-col p-6 lg:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:bg-zinc-50">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Playground</h1>
            <p className="text-sm text-zinc-500">Teste le bot — conversations internes, hors statistiques</p>
          </div>
        </div>
        <button
          onClick={newSession}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" /> Nouvelle session
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                Pose une question au bot pour vérifier ses réponses et ses sources.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === "user" ? "bg-zinc-900 text-white" : "bg-white text-zinc-800 border border-zinc-200"
                  }`}
                >
                  {m.content || (m.streaming ? "…" : "")}
                </div>
              </div>
            ))}
            {error && <div className="text-center text-xs text-red-500">{error}</div>}
          </div>
          <div className="flex items-end gap-2 border-t border-zinc-200 p-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder="Votre question…"
              className="max-h-32 flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-lg bg-zinc-900 p-2.5 text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900">Debug RAG</div>
          <div className="flex-1 overflow-y-auto p-4">
            {!debug ? (
              <p className="text-sm text-zinc-400">Envoie un message pour voir les chunks récupérés, la latence et les tokens.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-zinc-50 p-2">
                    <div className="text-xs text-zinc-400">Latence</div>
                    <div className="text-sm font-semibold text-zinc-900">{debug.latency_ms} ms</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2">
                    <div className="text-xs text-zinc-400">Tokens</div>
                    <div className="text-sm font-semibold text-zinc-900">{debug.tokens_used ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-2">
                    <div className="text-xs text-zinc-400">Chunks</div>
                    <div className="text-sm font-semibold text-zinc-900">{debug.chunks.length}</div>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-400">{debug.model}</div>
                <div className="space-y-3">
                  {debug.chunks.map((c, i) => (
                    <div key={i} className="rounded-lg border border-zinc-100 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-zinc-700">{c.title}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-emerald-600">
                          {Math.round(c.similarity * 100)}%
                        </span>
                      </div>
                      {c.section_heading && <div className="text-[11px] text-zinc-400">{c.section_heading}</div>}
                      <div className="mt-1 h-1 w-full rounded bg-zinc-100">
                        <div className="h-1 rounded bg-emerald-400" style={{ width: `${Math.round(c.similarity * 100)}%` }} />
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-[11px] text-zinc-500">{c.content}</p>
                    </div>
                  ))}
                  {debug.chunks.length === 0 && (
                    <p className="text-xs text-amber-600">Aucun chunk au-dessus du seuil — le bot répond sans contexte (il devrait dire qu’il ne sait pas).</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
