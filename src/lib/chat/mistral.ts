const MISTRAL_URL = "https://api.mistral.ai/v1/embeddings"
const BATCH_SIZE = 20
const BATCH_DELAY_MS = 600

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function embedBatch(texts: string[], retried = false): Promise<number[][]> {
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({ model: "mistral-embed", input: texts }),
  })
  if (response.status === 429 && !retried) {
    await sleep(2000)
    return embedBatch(texts, true)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mistral embed error (${response.status}): ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length <= BATCH_SIZE) return embedBatch(texts)
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    out.push(...(await embedBatch(batch)))
    if (i + BATCH_SIZE < texts.length) await sleep(BATCH_DELAY_MS)
  }
  return out
}
