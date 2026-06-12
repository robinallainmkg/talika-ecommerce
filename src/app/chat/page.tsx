"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { RefreshCw, Trash2, Inbox, FlaskConical, BookOpen, Settings } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { MessageBubble, ChatMessageView } from "@/components/chat/message-bubble"
import { relativeTime, StatusBadge } from "@/components/chat/helpers"

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

const TABS = [
  { key: "all", label: "Tous" },
  { key: "queued", label: "À traiter" },
  { key: "bot", label: "Bot" },
  { key: "human", label: "Humain" },
  { key: "closed", label: "Fermés" },
]

export default function ChatInboxPage() {
  const [tab, setTab] = useState("all")
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [selected, setSelected] = useState<ConversationRow | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchList = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/chat/admin/conversations?status=${tab}`)
      const data = await res.json()
      setConversations(data.conversations || [])
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
    const interval = setInterval(fetchList, 15000)
    return () => clearInterval(interval)
  }, [fetchList])

  useEffect(() => {
    if (selectedId) fetchThread(selectedId)
  }, [selectedId, fetchThread])

  async function deleteConversation(id: string) {
    if (!confirm("Supprimer définitivement cette conversation ?")) return
    await adminFetch(`/api/chat/admin/conversations/${id}`, { method: "DELETE" })
    setSelectedId(null)
    setSelected(null)
    setMessages([])
    fetchList()
  }

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-6 lg:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Chat IA</h1>
          <p className="text-sm text-zinc-500">Conversations du chat talika.fr</p>
        </div>
        <div className="flex items-center gap-2">
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
                {selected.visitor_email && <span className="text-xs text-zinc-500">· {selected.visitor_email}</span>}
                {selected.first_page_url && (
                  <span className="max-w-[180px] truncate text-xs text-zinc-400" title={selected.first_page_url}>
                    · {selected.first_page_url}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button disabled title="Disponible en V2" className="cursor-not-allowed rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-300">
                    Prendre la main
                  </button>
                  <button disabled title="Disponible en V2" className="cursor-not-allowed rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-300">
                    Rendre au bot
                  </button>
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
              </div>
              <div className="border-t border-zinc-200 px-4 py-2 text-center text-[11px] text-zinc-400">
                Réponse manuelle disponible en V2 (takeover)
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
