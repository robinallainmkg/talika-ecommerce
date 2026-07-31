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

/** Fiche de la page consultée : assez pour couvrir description + conseils + résultats. */
const MAX_PAGE_PRODUCT_CHUNKS = 5

export type RagContext = {
  contextBlock: string
  sources: RagSource[]
  chunks: RagChunk[]
  /** Fiche du produit dont le visiteur consulte la page, si elle a pu être résolue. */
  pageProduct: { title: string; handle: string } | null
}

/** Handle produit contenu dans une URL de page (`/products/<handle>`, préfixe de langue toléré). */
export function parseProductHandle(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null
  const match = pageUrl.match(/\/products\/([a-z0-9][a-z0-9\-_]*)/i)
  return match ? match[1].toLowerCase() : null
}

/**
 * Chunks de la fiche produit correspondant au handle. La recherche sémantique seule
 * ignore la page consultée : sur une question sans nom de produit (« les ingrédients ? »)
 * elle sert un produit au hasard. On réinjecte donc la bonne fiche explicitement.
 */
async function fetchPageProductChunks(
  db: SupabaseClient,
  handle: string,
  market: string,
  channel: string
): Promise<{ chunks: RagChunk[]; title: string } | null> {
  const { data: rows, error } = await db
    .from("kb_chunks")
    .select("id, document_id, chunk_index, section_heading, content, metadata")
    .eq("metadata->>handle", handle)
    .eq("market", market)
    .eq("channel", channel)
    .order("chunk_index", { ascending: true })
    .limit(MAX_PAGE_PRODUCT_CHUNKS)
  if (error || !rows || rows.length === 0) return null

  const { data: doc } = await db
    .from("kb_documents")
    .select("title, status, source_type")
    .eq("id", rows[0].document_id)
    .single()
  // Une fiche désactivée = produit retiré de la vente : ne pas la réinjecter.
  if (!doc || doc.status !== "indexed") return null

  return {
    title: doc.title as string,
    chunks: rows.map((r) => ({
      chunk_id: r.id as string,
      document_id: r.document_id as string,
      source_type: (doc.source_type as string) || "shopify_product",
      title: doc.title as string,
      section_heading: (r.section_heading as string) || null,
      content: r.content as string,
      metadata: (r.metadata as Record<string, unknown>) || null,
      // Réinjection déterministe, pas un score de similarité : 1 la place en tête.
      similarity: 1,
    })),
  }
}

export async function retrieveContext(
  db: SupabaseClient,
  queryEmbedding: number[],
  opts?: { market?: string; channel?: string; pageUrl?: string | null }
): Promise<RagContext> {
  const market = opts?.market || "FR"
  const channel = opts?.channel || "shopify"
  const { data, error } = await db.rpc("match_kb_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 8,
    p_market: market,
    p_channel: channel,
  })
  if (error) {
    console.error("match_kb_chunks error:", error.message)
    return { contextBlock: "", sources: [], chunks: [], pageProduct: null }
  }
  const matched = (data || []) as RagChunk[]

  // Fiche de la page consultée, en tête et dédupliquée de la recherche sémantique.
  const handle = parseProductHandle(opts?.pageUrl)
  let pageProduct: { title: string; handle: string } | null = null
  let chunks = matched
  if (handle) {
    const page = await fetchPageProductChunks(db, handle, market, channel)
    if (page) {
      pageProduct = { title: page.title, handle }
      const pageIds = new Set(page.chunks.map((c) => c.chunk_id))
      chunks = [...page.chunks, ...matched.filter((c) => !pageIds.has(c.chunk_id))]
    }
  }
  // Budget tokens : contenu plafonné par chunk pour tenir dans les quotas Groq
  const MAX_CHUNK_INJECT = 1200
  // Label produit VISIBLE et propre (sans identifiant technique : le handle ne doit
  // jamais être cité au visiteur — il est fourni à part, plus bas, pour le marqueur).
  const blocks = chunks.map((c) => {
    const meta = (c.metadata || {}) as { price?: string; currency?: string; url?: string; handle?: string }
    const isPageProduct = pageProduct !== null && meta.handle === pageProduct.handle
    const label =
      c.source_type === "shopify_product"
        ? `[Fiche produit — ${c.title}${meta.price ? ` — ${meta.price} ${meta.currency || "EUR"}` : ""}${meta.url ? ` — ${meta.url}` : ""}${isPageProduct ? " — PAGE ACTUELLEMENT CONSULTÉE PAR LE VISITEUR" : ""}]`
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
  return { contextBlock: blocks.join("\n\n---\n\n") + handlesNote, sources, chunks, pageProduct }
}
