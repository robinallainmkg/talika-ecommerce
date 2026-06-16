import { SupabaseClient } from "@supabase/supabase-js"

export type ProductRef = {
  handle: string
  title: string
  price: string | null
  currency: string
  url: string
  image_url: string | null
}

const PRODUCTS_RE = /<<<PRODUCTS:\[([\s\S]*?)\]>>>/
const ASK_EMAIL_RE = /<<<ASK_EMAIL>>>/g

export type ParsedMarkers = {
  text: string
  handles: string[]
  askEmail: boolean
}

// Extrait et retire les marqueurs de la réponse du modèle.
export function parseMarkers(raw: string): ParsedMarkers {
  let text = raw
  const askEmail = ASK_EMAIL_RE.test(text)
  text = text.replace(ASK_EMAIL_RE, "")

  const handles: string[] = []
  const m = text.match(PRODUCTS_RE)
  if (m) {
    text = text.replace(PRODUCTS_RE, "")
    try {
      const parsed = JSON.parse(`[${m[1]}]`)
      for (const h of parsed) {
        if (typeof h === "string" && h.trim()) handles.push(h.trim())
      }
    } catch {
      // marqueur mal formé → on ignore les produits
    }
  }
  // Trim de FIN seulement (les marqueurs sont en fin) — préserve les indices du début
  // pour le découpage du streaming.
  return { text: text.replace(/[\s ]+$/g, ""), handles: handles.slice(0, 3), askEmail }
}

// Résout des handles → product refs, UNIQUEMENT pour des produits réellement
// indexés (anti-invention). Lecture depuis kb_chunks.metadata.
export async function resolveProducts(
  db: SupabaseClient,
  handles: string[]
): Promise<ProductRef[]> {
  if (handles.length === 0) return []
  const { data } = await db
    .from("kb_chunks")
    .select("metadata, kb_documents!inner(source_type, status, title)")
    .eq("kb_documents.source_type", "shopify_product")
    .eq("kb_documents.status", "indexed")
    .in("metadata->>handle", handles)

  const byHandle = new Map<string, ProductRef>()
  for (const row of (data || []) as Array<{
    metadata: Record<string, unknown>
    kb_documents: { title: string } | { title: string }[]
  }>) {
    const meta = row.metadata || {}
    const handle = typeof meta.handle === "string" ? meta.handle : null
    if (!handle || byHandle.has(handle)) continue
    const doc = Array.isArray(row.kb_documents) ? row.kb_documents[0] : row.kb_documents
    byHandle.set(handle, {
      handle,
      title: (doc?.title as string) || handle,
      price: typeof meta.price === "string" ? meta.price : null,
      currency: typeof meta.currency === "string" ? meta.currency : "EUR",
      url: typeof meta.url === "string" ? meta.url : `https://talika.fr/products/${handle}`,
      image_url: typeof meta.image_url === "string" ? meta.image_url : null,
    })
  }
  // Respecte l'ordre demandé par le modèle
  return handles.map((h) => byHandle.get(h)).filter((p): p is ProductRef => !!p)
}
