const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
export const GROQ_MODEL = "llama-3.3-70b-versatile"
// Les quotas Groq (tokens/jour) sont PAR MODÈLE : si le 70b est épuisé,
// le 8b-instant prend le relais avant le fallback règles.
const MODEL_CHAIN = [GROQ_MODEL, "llama-3.1-8b-instant"]

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type GroqStreamResult = {
  model: string
  deltas: AsyncGenerator<string>
  getFinal: () => { content: string; tokensUsed: number | null }
}

export async function streamChatCompletion(messages: ChatMessage[]): Promise<GroqStreamResult> {
  let response: Response | null = null
  let model = GROQ_MODEL
  let lastError = ""
  for (const candidate of MODEL_CHAIN) {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: candidate,
        messages,
        temperature: 0.3,
        max_tokens: 600,
        top_p: 0.9,
        stream: true,
        stream_options: { include_usage: true },
      }),
    })
    if (response.ok && response.body) {
      model = candidate
      break
    }
    lastError = `Groq error ${candidate} (${response.status}): ${(await response.text()).slice(0, 200)}`
    console.warn(lastError)
    response = null
  }
  if (!response || !response.body) {
    throw new Error(lastError || "Groq indisponible")
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

  return { model, deltas: deltas(), getFinal: () => ({ content: state.content, tokensUsed: state.tokensUsed }) }
}
