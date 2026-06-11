export type SseDebug = {
  chunks: Array<{ title: string; section_heading: string | null; similarity: number; content: string }>
  tokens_used: number | null
  latency_ms: number
  model: string
}

export type SseDone = {
  sources: Array<{ title: string; similarity: number }>
  daily_remaining?: number | null
  status: string
  debug?: SseDebug
}

export async function streamChatMessage(opts: {
  token: string
  message: string
  debug?: boolean
  onDelta: (text: string) => void
  onDone: (done: SseDone) => void
  onError: (message: string) => void
}): Promise<void> {
  try {
    const response = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: opts.token, message: opts.message, debug: opts.debug }),
    })
    if (!response.body) {
      opts.onError("Pas de réponse du serveur")
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let currentEvent = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            const data = JSON.parse(payload)
            if (currentEvent === "delta" && data.text) opts.onDelta(data.text)
            else if (currentEvent === "done") opts.onDone(data as SseDone)
            else if (currentEvent === "error") opts.onError(data.message || "Erreur")
          } catch {
            continue
          }
        }
      }
    }
  } catch (err) {
    opts.onError((err as Error).message)
  }
}
