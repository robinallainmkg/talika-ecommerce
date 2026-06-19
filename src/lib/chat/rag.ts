import { SupabaseClient } from "@supabase/supabase-js"

export type RagSource = {
  document_id: string
  title: string
  similarity: number
  source_type: string
}

export type RagChunk = {
  chunk_id: string
  document_id: string
  source_type: string
  title: string
  section_heading: string | null
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

export type RagContext = {
  contextBlock: string
  sources: RagSource[]
  chunks: RagChunk[]
}

export async function retrieveContext(
  db: SupabaseClient,
  queryEmbedding: number[],
  opts?: { market?: string; channel?: string }
): Promise<RagContext> {
  const { data, error } = await db.rpc("match_kb_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 8,
    p_market: opts?.market || "FR",
    p_channel: opts?.channel || "shopify",
  })
  if (error) {
    console.error("match_kb_chunks error:", error.message)
    return { contextBlock: "", sources: [], chunks: [] }
  }
  const chunks = (data || []) as RagChunk[]
  // Budget tokens : contenu plafonné par chunk pour tenir dans les quotas Groq
  const MAX_CHUNK_INJECT = 1200
  // Label produit VISIBLE et propre (sans identifiant technique : le handle ne doit
  // jamais être cité au visiteur — il est fourni à part, plus bas, pour le marqueur).
  const blocks = chunks.map((c) => {
    const meta = (c.metadata || {}) as { price?: string; currency?: string; url?: string; handle?: string }
    const label =
      c.source_type === "shopify_product"
        ? `[Fiche produit — ${c.title}${meta.price ? ` — ${meta.price} ${meta.currency || "EUR"}` : ""}${meta.url ? ` — ${meta.url}` : ""}]`
        : `[Document — ${c.title}${c.section_heading ? ` — ${c.section_heading}` : ""}]`
    const content =
      c.content.length > MAX_CHUNK_INJECT ? `${c.content.slice(0, MAX_CHUNK_INJECT)}…` : c.content
    return `${label}\n${content}`
  })
  const seen = new Set<string>()
  const sources: RagSource[] = []
  const handleMap: string[] = []
  for (const c of chunks) {
    const meta = (c.metadata || {}) as { handle?: string }
    if (c.source_type === "shopify_product" && meta.handle && !handleMap.some((h) => h.startsWith(c.title + "="))) {
      handleMap.push(`${c.title}=${meta.handle}`)
    }
    if (seen.has(c.document_id)) continue
    seen.add(c.document_id)
    sources.push({
      document_id: c.document_id,
      title: c.title,
      similarity: Math.round(c.similarity * 100) / 100,
      source_type: c.source_type,
    })
  }
  // Mapping handle réservé au marqueur <<<PRODUCTS>>> — explicitement NON citable.
  const handlesNote =
    handleMap.length > 0
      ? `\n\n---\nIdentifiants produits pour le marqueur <<<PRODUCTS>>> uniquement (NE JAMAIS les écrire dans ta réponse visible) :\n${handleMap.join("\n")}`
      : ""
  return { contextBlock: blocks.join("\n\n---\n\n") + handlesNote, sources, chunks }
}
