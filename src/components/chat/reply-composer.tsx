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
    <div className="flex items-end gap-2 border-t border-[#E8E2D5] bg-white p-3">
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
        className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-[#E8E2D5] bg-[#FBF9F3] px-4 py-2.5 text-sm focus:border-[#0A1638] focus:bg-white focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={sending || !value.trim()}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#0A1638] text-white hover:bg-[#16224D] disabled:opacity-40"
        title="Envoyer"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
