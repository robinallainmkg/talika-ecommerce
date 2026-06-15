"use client"

import { useState } from "react"
import { Send } from "lucide-react"

export function ReplyComposer({ onSend }: { onSend: (content: string) => Promise<void> }) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)

  async function submit() {
    const content = value.trim()
    if (!content || sending) return
    setSending(true)
    try {
      await onSend(content)
      setValue("")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-zinc-200 p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={1}
        placeholder="Votre réponse au visiteur… (Entrée pour envoyer)"
        className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={sending || !value.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40"
        title="Envoyer"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
