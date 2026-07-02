"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { RefreshCw, Trash2, Inbox, FlaskConical, BookOpen, Settings, Bell, BellOff, Hand, Bot, X } from "lucide-react"
import { adminFetch } from "@/lib/chat/admin-fetch"
import { MessageBubble, ChatMessageView } from "@/components/chat/message-bubble"
import { relativeTime, StatusBadge } from "@/components/chat/helpers"
import { ReplyComposer } from "@/components/chat/reply-composer"
import { VisitorPanel } from "@/components/chat/visitor-panel"
import { SalesCard } from "@/components/chat/sales-card"

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
  customer_orders_count: number | null
  taken_over_by: string | null
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

// Compare deux listes de conversations sur les champs qui changent l'affichage —
// évite un setState (et un re-render de toute la liste) quand rien n'a bougé.
function sameList(a: ConversationRow[], b: ConversationRow[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.unread_count !== y.unread_count ||
      x.last_message_at !== y.last_message_at ||
      x.last_message_preview !== y.last_message_preview
    ) {
      return false
    }
  }
  return true
}

// AudioContext réutilisé (les navigateurs limitent le nombre d'instances).
let audioCtx: AudioContext | null = null
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtx) audioCtx = new Ctx()
    const ctx = audioCtx
    if (ctx.state === "suspended") ctx.resume()
    // Deux notes douces (carillon) : sol5 → do6
    const notes = [
      { freq: 784, at: 0, dur: 0.18 },
      { freq: 1047, at: 0.16, dur: 0.28 },
    ]
    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = n.freq
      const start = ctx.currentTime + n.at
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
      osc.start(start)
      osc.stop(start + n.dur + 0.02)
    }
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

  // Pour chaque conversation nécessitant un humain : dernier last_message_at déjà alerté.
  const alertedAt = useRef<Map<string, string>>(new Map())
  // Conversations lues cette session : id → last_message_at au moment de la lecture.
  // Le serveur remet unread_count à 0 à l'ouverture (GET détail), mais un poll de
  // liste parti AVANT ce reset peut revenir avec l'ancien compteur et rallumer la
  // pastille. On force donc localement unread=0 tant qu'aucun message plus récent
  // que la lecture n'est arrivé.
  const readAt = useRef<Map<string, string>>(new Map())
  const firstLoad = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const threadSig = useRef<string>("")

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
      // Une conversation lue reste lue : on écrase unread_count pour celles ouvertes
      // cette session, sauf si un message PLUS RÉCENT que la lecture est arrivé.
      const convs: ConversationRow[] = (data.conversations || []).map((c: ConversationRow) => {
        const seenAt = readAt.current.get(c.id)
        if (seenAt && c.unread_count > 0 && (!c.last_message_at || c.last_message_at <= seenAt)) {
          return { ...c, unread_count: 0 }
        }
        return c
      })
      setConversations((prev) => (sameList(prev, convs) ? prev : convs))

      // Détection GLOBALE (toutes conversations, pas seulement l'ouverte) :
      // on alerte pour une conversation qui a besoin d'un humain (queued/human)
      // et qui reçoit un nouveau message visiteur, OU une nouvelle mise en attente.
      const fresh: ConversationRow[] = []
      for (const c of convs) {
        const needsHuman = c.status === "queued" || c.status === "human"
        if (!needsHuman) {
          alertedAt.current.delete(c.id)
          continue
        }
        const prevTs = alertedAt.current.get(c.id)
        const isNew = prevTs === undefined
        const advanced = !!prevTs && !!c.last_message_at && c.last_message_at > prevTs
        const isVisitorMsg = (c.last_message_preview || "").startsWith("Visiteur :")
        if (!firstLoad.current && ((isNew && c.status === "queued") || (advanced && isVisitorMsg))) {
          fresh.push(c)
        }
        if (c.last_message_at) alertedAt.current.set(c.id, c.last_message_at)
      }
      if (fresh.length > 0) {
        chime() // son systématique, quelle que soit la conversation ouverte
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          for (const c of fresh) {
            new Notification("Talika — un visiteur attend une réponse", {
              body: c.last_message_preview || c.visitor_email || "Nouveau message dans le chat",
              tag: c.id,
            })
          }
        }
      }
      firstLoad.current = false

      // Titre d'onglet avec le compteur "à traiter"
      const waitingCount = convs.filter((c) => c.status === "queued" || c.unread_count > 0).length
      if (typeof document !== "undefined") {
        document.title = waitingCount > 0 ? `(${waitingCount}) Chat IA — Talika` : "Chat IA — Talika"
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
      const msgs: ChatMessageView[] = data.messages || []
      // Mise à jour idempotente : on ne re-render (et ne scrolle) que si le fil a
      // réellement changé. Évite le "saut" de scroll toutes les quelques secondes.
      const sig = msgs.length + ":" + (msgs[msgs.length - 1]?.id || "")
      if (sig !== threadSig.current) {
        threadSig.current = sig
        setMessages(msgs)
      }
      const conv: ConversationDetail | null = data.conversation || null
      // Le GET détail vient de remettre unread_count=0 côté serveur : on avance le
      // repère de lecture au dernier message réellement affiché (couvre les
      // messages arrivés pendant que le fil est ouvert).
      if (conv) readAt.current.set(id, conv.last_message_at || new Date().toISOString())
      setSelected((prev) =>
        prev && conv && prev.status === conv.status && prev.message_count === conv.message_count && prev.last_page_url === conv.last_page_url
          ? prev
          : conv
      )
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchList()
    const interval = setInterval(fetchList, 6000)
    return () => clearInterval(interval)
  }, [fetchList])

  // Rafraîchissement live du fil ouvert (voir les nouveaux messages visiteur)
  useEffect(() => {
    if (!selectedId) return
    threadSig.current = ""
    nearBottom.current = true
    fetchThread(selectedId)
    const interval = setInterval(() => fetchThread(selectedId), 4000)
    return () => clearInterval(interval)
  }, [selectedId, fetchThread])

  // Scroll vers le bas uniquement si l'agent était déjà en bas (ne l'arrache pas
  // de sa lecture s'il a remonté le fil).
  useEffect(() => {
    if (nearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
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

      <SalesCard />

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
                  onClick={() => {
                    setSelectedId(conv.id)
                    // Marquage lu optimiste : pastille éteinte tout de suite (le
                    // serveur est remis à 0 par le GET détail juste derrière).
                    readAt.current.set(conv.id, conv.last_message_at || new Date().toISOString())
                    if (conv.unread_count > 0) {
                      setConversations((prev) =>
                        prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
                      )
                    }
                  }}
                  className={`block w-full border-b border-zinc-100 px-3 py-2.5 text-left hover:bg-zinc-50 ${
                    selectedId === conv.id ? "bg-zinc-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={conv.status} />
                    {(conv.customer_orders_count || 0) >= 3 && (
                      <span
                        className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        title={`Cliente fidèle — ${conv.customer_orders_count} commandes`}
                      >
                        ★ fidèle
                      </span>
                    )}
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
              <div
                ref={messagesScrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget
                  nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
                }}
                className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/50 p-4"
              >
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
