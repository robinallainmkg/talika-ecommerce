const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
export const CHAT_MODEL = "mistral-small-latest"
// Hébergé UE, déjà payé. Chaîne de secours : on retente small (panne souvent
// transitoire) puis on passe à mistral-medium (nettement meilleur que nemo, qui
// donnait des réponses génériques et perdait le fil). Le moteur de règles reste
// le dernier filet, géré en amont (message/route).
const MODEL_CHAIN = [CHAT_MODEL, CHAT_MODEL, "mistral-medium-latest"]

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type LlmStreamResult = {
  model: string
  deltas: AsyncGenerator<string>
  getFinal: () => { content: string; tokensUsed: number | null }
}

export async function streamChatCompletion(messages: ChatMessage[]): Promise<LlmStreamResult> {
  let response: Response | null = null
  let model = CHAT_MODEL
  let lastError = ""
  for (const candidate of MODEL_CHAIN) {
    response = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: candidate,
        messages,
        temperature: 0.3,
        max_tokens: 600,
        top_p: 0.9,
        stream: true,
      }),
    })
    if (response.ok && response.body) {
      model = candidate
      break
    }
    lastError = `Mistral error ${candidate} (${response.status}): ${(await response.text()).slice(0, 200)}`
    console.warn(lastError)
    response = null
  }
  if (!response || !response.body) {
    throw new Error(lastError || "Mistral indisponible")
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
