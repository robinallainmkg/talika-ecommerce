"use client"

// Drawer "Conversation" — fil email complet avec une influenceuse (influence_messages)
// + zone de réponse (Phase 1 : UK via talika@companion-ecommerce.com ; FR = lecture
// seule tant que la boîte Outlook n'est pas connectée). Ouvert au CLIC SUR LA CARTE
// kanban ; le clic sur le NOM ouvre le drawer profil (cross-link onOpenProfile).
import { useEffect, useRef, useState } from "react"
import { X, Loader2, Send, User, Instagram, AlertTriangle, MailQuestion } from "lucide-react"

interface Msg {
  id: string
  direction: "in" | "out"
  source: string
  from_email: string
  to_email: string
  subject: string | null
  body_text: string | null
  sent_at: string
}
interface Convo {
  influencer: { id: string; name: string; email: string | null; market: string; instagram_handle: string | null }
  outreach: { status?: string } | null
  messages: Msg[]
  can_reply: boolean
  reply_blocked_reason: string | null
}
interface Props {
  influencerId: string | null
  onClose: () => void
  onOpenProfile?: (id: string) => void
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
  " · " + new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

export function ConversationDrawer({ influencerId, onClose, onOpenProfile }: Props) {
  const [data, setData] = useState<Convo | null>(null)
  const [loading, setLoading] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/influencers/conversations?influencer_id=${id}`, { cache: "no-store" })
      const j = await res.json()
      setData(j.error ? null : j)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    setImgError(false); setReply(""); setNote("")
    if (!influencerId) { setData(null); return }
    load(influencerId)
  }, [influencerId])

  useEffect(() => {
    // Fil chargé → on se place sur le dernier message.
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [data?.messages?.length])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (influencerId) window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [influencerId, onClose])

  async function sendReply() {
    if (!data || !influencerId || !reply.trim() || sending) return
    if (!confirm(`Envoyer cette réponse à ${data.influencer.email} ?`)) return
    setSending(true); setNote("")
    try {
      const res = await fetch("/api/influencers/conversations/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: influencerId, body: reply.trim() }),
      })
      const j = await res.json()
      if (!res.ok) { setNote(j.error || "Envoi échoué"); return }
      setReply("")
      if (j.warning) setNote(j.warning)
      load(influencerId)
    } finally { setSending(false) }
  }

  if (!influencerId) return null
  const inf = data?.influencer
  const handle = inf?.instagram_handle?.replace(/^@/, "")

  // Sujet affiché seulement quand il change le long du fil (hors préfixes Re:).
  const normSubject = (s: string | null) => (s || "").replace(/^(re|fwd?)\s*:\s*/gi, "").trim().toLowerCase()

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col bg-white shadow-2xl">
        {loading || !inf ? (
          <div className="flex h-full items-center justify-center">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-zinc-300" /> : <p className="text-sm text-zinc-400">Conversation introuvable.</p>}
          </div>
        ) : (
          <>
            {/* En-tête — le nom ouvre le profil (cross-link) */}
            <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
              {handle && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`https://unavatar.io/instagram/${handle}?fallback=false`} alt="" onError={() => setImgError(true)} className="h-11 w-11 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-base font-semibold text-white">
                  {inf.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onOpenProfile?.(inf.id)}
                  className="block max-w-full truncate text-left text-lg font-semibold text-zinc-900 hover:underline"
                  title="Voir le profil">
                  {inf.name}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  <span>{inf.market === "UK" ? "🇬🇧" : "🇫🇷"} {inf.email || "email manquant"}</span>
                  {inf.instagram_handle && (
                    <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-900">
                      <Instagram className="h-3.5 w-3.5" />{inf.instagram_handle}
                    </a>
                  )}
                  {data?.outreach?.status && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{data.outreach.status}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {onOpenProfile && (
                  <button onClick={() => onOpenProfile(inf.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Voir le profil">
                    <User className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Fil */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/60 px-4 py-4">
              {(data?.messages || []).length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
                  <MailQuestion className="h-8 w-8 text-zinc-300" />
                  <p>Aucun échange archivé pour l&apos;instant.<br />Les prochains emails (drip, compose, réponses) apparaîtront ici.</p>
                </div>
              )}
              {(data?.messages || []).map((m, i, arr) => {
                const showSubject = i === 0 || normSubject(m.subject) !== normSubject(arr[i - 1].subject)
                const out = m.direction === "out"
                return (
                  <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${out ? "rounded-br-sm bg-zinc-900 text-zinc-50" : "rounded-bl-sm border border-zinc-200 bg-white text-zinc-800"}`}>
                      {showSubject && m.subject && (
                        <p className={`mb-1 text-[11px] font-semibold ${out ? "text-zinc-300" : "text-zinc-500"}`}>{m.subject}</p>
                      )}
                      {m.body_text ? (
                        <p className="whitespace-pre-wrap break-words">{m.body_text}</p>
                      ) : (
                        <p className={`italic ${out ? "text-zinc-400" : "text-zinc-400"}`}>(sujet seul — corps non archivé)</p>
                      )}
                      <p className={`mt-1.5 text-[10px] ${out ? "text-zinc-400" : "text-zinc-400"}`}>
                        {dateLabel(m.sent_at)}{out && m.source === "drip" ? " · drip auto" : ""}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Réponse */}
            <div className="border-t border-zinc-100 bg-white px-4 py-3">
              {note && (
                <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{note}</p>
              )}
              {data?.can_reply ? (
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={3}
                    placeholder={`Répondre à ${inf.name.split(" ")[0]}… (envoi depuis talika@companion-ecommerce.com)`}
                    className="flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                    title="Envoyer la réponse">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  Lecture seule — {data?.reply_blocked_reason || "réponse indisponible"}.
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}
