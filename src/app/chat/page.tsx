"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { RefreshCw, Trash2, Inbox, FlaskConical, BookOpen, Settings, Bell, BellOff, Hand, Bot, X } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { MessageBubble, ChatMessageView } from "@/components/chat/message-bubble"
import { relativeTime, StatusBadge } from "@/components/chat/helpers"
import { ReplyComposer } from "@/components/chat/reply-composer"
import { VisitorPanel } from "@/components/chat/visitor-panel"

type ConversationRow = {
  id: string
  status: string
  visitor_email: string | null
  first_page_url: string | null
  message_count: number
  unread_count: number
  last_message_at: string | null
  created_at: string
  last_message_preview: string
}

type ConversationDetail = ConversationRow & {
  visitor_name: string | null
  user_agent: string | null
  last_page_url: string | null
  taken_over_at: string | null
}

const TABS = [
  { key: "all", label: "Tous" },
  { key: "queued", label: "À traiter" },
  { key: "bot", label: "Bot" },
  { key: "human", label: "Humain" },
  { key: "closed", label: "Fermés" },
]

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // pas de son disponible
  }
}

export default function ChatInboxPage() {
  const [tab, setTab] = useState("all")
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [selected, setSelected] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifEnabled, setNotifEnabled] = useState(false)

  const knownWaiting = useRef<Set<string>>(new Set())
  const firstLoad = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const refreshNotifState = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifEnabled(Notification.permission === "granted")
    }
  }, [])

  useEffect(() => {
    refreshNotifState()
  }, [refreshNotifState])

  async function enableNotifications() {
    if (!("Notification" in window)) return
    const perm = await Notification.requestPermission()
    setNotifEnabled(perm === "granted")
  }

  const fetchList = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/chat/admin/conversations?status=${tab}`)
      const data = await res.json()
      const convs: ConversationRow[] = data.conversations || []
      setConversations(convs)

      // Détection des nouveaux visiteurs en attente → notification
      const waiting = convs.filter((c) => c.status === "queued" || c.unread_count > 0)
      const waitingIds = new Set(waiting.map((c) => c.id))
      if (!firstLoad.current) {
        for (const c of waiting) {
          if (!knownWaiting.current.has(c.id)) {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("Talika — un visiteur attend une réponse", {
                body: c.last_message_preview || c.visitor_email || "Nouveau message dans le chat",
                tag: c.id,
              })
              beep()
            }
          }
        }
      }
      knownWaiting.current = waitingIds
      firstLoad.current = false

      // Titre d'onglet avec le compteur "à traiter"
      if (typeof document !== "undefined") {
        document.title = waiting.length > 0 ? `(${waiting.length}) Chat IA — Talika` : "Chat IA — Talika"
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tab])

  const fetchThread = useCallback(async (id: string) => {
    try {
      const res = await adminFetch(`/api/chat/admin/conversations/${id}`)
      const data = await res.json()
      setMessages(data.messages || [])
      setSelected(data.conversation || null)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchList()
    const interval = setInterval(fetchList, 12000)
    return () => clearInterval(interval)
  }, [fetchList])

  // Rafraîchissement live du fil ouvert (voir les nouveaux messages visiteur)
  useEffect(() => {
    if (!selectedId) return
    fetchThread(selectedId)
    const interval = setInterval(() => fetchThread(selectedId), 5000)
    return () => clearInterval(interval)
  }, [selectedId, fetchThread])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function takeover(action: "take" | "release" | "close") {
    if (!selected) return
    await adminFetch(`/api/chat/admin/conversations/${selected.id}/takeover`, {
      method: "POST",
      body: JSON.stringify({ action }),
    })
    await fetchThread(selected.id)
    fetchList()
  }

  async function sendReply(content: string) {
    if (!selected) return
    const res = await adminFetch(`/api/chat/admin/conversations/${selected.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.message) setMessages((prev) => [...prev, data.message])
      await fetchThread(selected.id)
      fetchList()
    } else {
      alert("L'envoi a échoué. Réessayez.")
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("Supprimer définitivement cette conversation ?")) return
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setSelectedId(null)
    setSelected(null)
    setMessages([])
    const res = await adminFetch(`/api/chat/admin/conversations/${id}`, { method: "DELETE" })
    if (!res.ok) alert("La suppression a échoué. Réessayez.")
    fetchList()
  }

  const canReply = selected && (selected.status === "human" || selected.status === "queued")

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-6 lg:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Chat IA</h1>
          <p className="text-sm text-zinc-500">Conversations du chat talika.fr</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={enableNotifications}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
              notifEnabled
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
            title={notifEnabled ? "Notifications activées" : "Activer les notifications de nouveaux messages"}
          >
            {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {notifEnabled ? "Notifications activées" : "Activer les notifications"}
          </button>
          <Link href="/chat/playground" className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <FlaskConical className="h-4 w-4" /> Playground
          </Link>
          <Link href="/chat/knowledge" className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <BookOpen className="h-4 w-4" /> Connaissances
          </Link>
          <Link href="/chat/settings" className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <Settings className="h-4 w-4" /> Réglages
          </Link>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex w-80 shrink-0 flex-col border-r border-zinc-200">
          <div className="flex items-center gap-1 border-b border-zinc-200 p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  tab === t.key ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button onClick={fetchList} className="ml-auto rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100" title="Rafraîchir">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-zinc-400">Chargement…</div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Inbox className="h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-400">Aucune conversation pour le moment.</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`block w-full border-b border-zinc-100 px-3 py-2.5 text-left hover:bg-zinc-50 ${
                    selectedId === conv.id ? "bg-zinc-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={conv.status} />
                    {conv.unread_count > 0 && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    <span className="ml-auto text-[11px] text-zinc-400">{relativeTime(conv.last_message_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-600">{conv.last_message_preview || "—"}</p>
                  {conv.visitor_email && <p className="mt-0.5 truncate text-[11px] text-zinc-400">{conv.visitor_email}</p>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-zinc-500">
                  {selected.message_count} messages · créée {relativeTime(selected.created_at)}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {(selected.status === "bot" || selected.status === "queued") && (
                    <button
                      onClick={() => takeover("take")}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      <Hand className="h-3.5 w-3.5" /> Prendre la main
                    </button>
                  )}
                  {selected.status === "human" && (
                    <button
                      onClick={() => takeover("release")}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <Bot className="h-3.5 w-3.5" /> Rendre au bot
                    </button>
                  )}
                  {selected.status !== "closed" && (
                    <button
                      onClick={() => takeover("close")}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
                    >
                      <X className="h-3.5 w-3.5" /> Fermer
                    </button>
                  )}
                  <button
                    onClick={() => deleteConversation(selected.id)}
                    className="rounded-lg border border-red-100 p-1.5 text-red-400 hover:bg-red-50"
                    title="Supprimer (RGPD)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 p-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>
              {canReply ? (
                <ReplyComposer onSend={sendReply} />
              ) : selected.status === "bot" ? (
                <div className="border-t border-zinc-200 px-4 py-2 text-center text-[11px] text-zinc-400">
                  L&apos;assistante répond automatiquement. Cliquez sur « Prendre la main » pour intervenir.
                </div>
              ) : (
                <div className="border-t border-zinc-200 px-4 py-2 text-center text-[11px] text-zinc-400">
                  Conversation fermée.
                </div>
              )}
            </>
          )}
        </div>

        {selected && <VisitorPanel conversation={selected} />}
      </div>
    </div>
  )
}
