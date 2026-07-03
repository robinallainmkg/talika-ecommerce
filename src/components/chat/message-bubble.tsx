"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, User } from "lucide-react"

// Reprend l'identité du widget client (navy #0A1638, crème #F7F4ED, or #D9B779,
// avatar monogramme « T », rayons asymétriques) — côté admin le visiteur est à
// GAUCHE, le bot et l'équipe (« nous ») à DROITE.

export type ChatMessageView = {
  id: string
  role: "user" | "assistant" | "agent" | "system"
  content: string
  rag_sources?: Array<{ title: string; similarity: number; source_type?: string }> | null
  model?: string | null
  tokens_used?: number | null
  created_at: string
}

function Sources({ sources }: { sources: Array<{ title: string; similarity: number }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Sources ({sources.length})
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {sources.map((s, i) => (
            <li key={i} className="text-[11px] text-zinc-500">
              {s.title} <span className="text-zinc-400">— {Math.round(s.similarity * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AvatarT({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 select-none items-center justify-center self-end rounded-full border-[1.5px] border-[#D9B779] ${
        dark ? "bg-[#0A1638]" : "bg-[#0A1638]"
      } font-serif italic text-[15px] leading-none text-[#D9B779]`}
    >
      T
    </span>
  )
}

export function MessageBubble({ message }: { message: ChatMessageView }) {
  if (message.role === "system") {
    return (
      <div className="my-2 text-center text-xs italic text-zinc-400">{message.content}</div>
    )
  }
  const isUser = message.role === "user"
  const isAgent = message.role === "agent"
  const time = new Date(message.created_at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (isUser) {
    return (
      <div className="flex items-end justify-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full border border-zinc-200 bg-white text-zinc-400">
          <User className="h-3.5 w-3.5" />
        </span>
        <div className="max-w-[72%] rounded-[16px_16px_16px_4px] border border-[#E8E2D5] bg-white px-3.5 py-2.5 text-sm text-zinc-800 shadow-sm">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
          <div className="mt-1 text-[10px] tabular-nums text-zinc-400">{time}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end justify-end gap-2">
      <div
        className={`max-w-[72%] rounded-[16px_16px_4px_16px] px-3.5 py-2.5 text-sm shadow-sm ${
          isAgent
            ? "bg-[#0A1638] text-white"
            : "border border-[#EDE7D8] bg-[#FDFBF6] text-zinc-800"
        }`}
      >
        <div
          className={`mb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] ${
            isAgent ? "text-[#D9B779]" : "text-zinc-400"
          }`}
        >
          {isAgent ? "Équipe Talika" : `Assistante IA${message.model ? ` · ${message.model}` : ""}`}
        </div>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {!isAgent && message.rag_sources && message.rag_sources.length > 0 && (
          <Sources sources={message.rag_sources} />
        )}
        <div
          className={`mt-1 text-right text-[10px] tabular-nums ${
            isAgent ? "text-white/50" : "text-zinc-400"
          }`}
        >
          {time}
        </div>
      </div>
      <AvatarT dark={isAgent} />
    </div>
  )
}
