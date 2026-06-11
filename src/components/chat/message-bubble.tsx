"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Bot } from "lucide-react"

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

export function MessageBubble({ message }: { message: ChatMessageView }) {
  if (message.role === "system") {
    return (
      <div className="my-2 text-center text-xs italic text-zinc-400">{message.content}</div>
    )
  }
  const isUser = message.role === "user"
  const isAgent = message.role === "agent"
  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? "bg-zinc-100 text-zinc-800"
            : isAgent
            ? "bg-blue-50 text-zinc-800 border border-blue-100"
            : "bg-white text-zinc-800 border border-zinc-200"
        }`}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {isAgent ? (
              "Équipe Talika"
            ) : (
              <>
                <Bot className="h-3 w-3" /> IA{message.model ? ` · ${message.model}` : ""}
              </>
            )}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.rag_sources && message.rag_sources.length > 0 && (
          <Sources sources={message.rag_sources} />
        )}
        <div className="mt-1 text-right text-[10px] text-zinc-400">
          {new Date(message.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}
