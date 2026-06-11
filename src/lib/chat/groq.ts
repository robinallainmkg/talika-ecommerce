const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
export const GROQ_MODEL = "llama-3.3-70b-versatile"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type GroqStreamResult = {
  deltas: AsyncGenerator<string>
  getFinal: () => { content: string; tokensUsed: number | null }
}

export async function streamChatCompletion(messages: ChatMessage[]): Promise<GroqStreamResult> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 600,
      top_p: 0.9,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`Groq error (${response.status}): ${text.slice(0, 300)}`)
  }

  const state = { content: "", tokensUsed: null as number | null }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  async function* deltas(): AsyncGenerator<string> {
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (payload === "[DONE]") continue
        try {
          const json = JSON.parse(payload)
          const delta: string | undefined = json.choices?.[0]?.delta?.content
          if (json.usage?.total_tokens) state.tokensUsed = json.usage.total_tokens
          if (delta) {
            state.content += delta
            yield delta
          }
        } catch {
          continue
        }
      }
    }
  }

  return { deltas: deltas(), getFinal: () => ({ content: state.content, tokensUsed: state.tokensUsed }) }
}
