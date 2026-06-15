import crypto from "node:crypto"
import { SupabaseClient } from "@supabase/supabase-js"
import { cleanContent, chunkText } from "./chunking"
import { insertChunks } from "./ingest"

const STOREFRONT_BASE = "https://talika.fr"
const API_VERSION = "2024-10"

type Metafield = { value: string } | null

type ShopifyProduct = {
  legacyResourceId: string
  handle: string
  title: string
  descriptionHtml: string
  onlineStoreUrl: string | null
  featuredImage: { url: string } | null
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } }
  totalInventory: number
  productType: string
  tags: string[]
  // Métafields Accentuate : contenu riche des fiches (souvent absent de descriptionHtml)
  advice: Metafield
  results: Metafield
  ingredients: Metafield
  statement: Metafield
  productSize: Metafield
}

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) throw new Error("SHOPIFY_STORE_DOMAIN / SHOPIFY_ACCESS_TOKEN manquants")

  const products: ShopifyProduct[] = []
  let cursor: string | null = null
  for (let page = 0; page < 30; page++) {
    const query = `
      query($cursor: String) {
        products(first: 100, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes {
            legacyResourceId handle title descriptionHtml onlineStoreUrl
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            totalInventory productType tags
            advice: metafield(namespace: "accentuate", key: "advice") { value }
            results: metafield(namespace: "accentuate", key: "results") { value }
            ingredients: metafield(namespace: "accentuate", key: "ingredients") { value }
            statement: metafield(namespace: "accentuate", key: "statement") { value }
            productSize: metafield(namespace: "accentuate", key: "product_size") { value }
          }
        }
      }`
    const response: Response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables: { cursor } }),
    })
    if (!response.ok) throw new Error(`Shopify GraphQL error: ${response.status}`)
    const json: {
      errors?: unknown
      data: {
        products: {
          pageInfo: { hasNextPage: boolean; endCursor: string }
          nodes: ShopifyProduct[]
        }
      }
    } = await response.json()
    if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
    const data = json.data.products
    products.push(...data.nodes)
    if (!data.pageInfo.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }
  return products
}

// Tags techniques Shopify (statuts d'app, flags d'affichage) : inutiles pour le RAG,
// ils polluent l'embedding et gaspillent des tokens dans le contexte.
function isJunkTag(tag: string): boolean {
  const t = tag.toLowerCase().trim()
  return (
    t.startsWith("spo-") ||
    t.startsWith("spo_") ||
    t.startsWith("tag_sale") ||
    t.startsWith("__") ||
    t.startsWith("yo_") ||
    t.includes("disabled") ||
    t.includes("notify-me") ||
    /^[a-z]+_(default|enabled|disabled|hot)$/.test(t)
  )
}

function mf(field: Metafield): string {
  return field?.value ? cleanContent(field.value) : ""
}

function buildProductText(p: ShopifyProduct): string {
  const cleanTags = (p.tags || []).filter((t) => t && !isJunkTag(t))
  const advice = mf(p.advice)
  const results = mf(p.results)
  const ingredients = mf(p.ingredients)
  const statement = mf(p.statement)
  const size = mf(p.productSize)
  return [
    `# ${p.title}`,
    p.productType ? `Type : ${p.productType}` : "",
    cleanTags.length ? `Tags : ${cleanTags.join(", ")}` : "",
    size ? `Format : ${size}` : "",
    "",
    cleanContent(p.descriptionHtml || ""),
    statement ? `\n## En bref\n${statement}` : "",
    advice ? `\n## Conseils d'utilisation\n${advice}` : "",
    results ? `\n## Résultats\n${results}` : "",
    ingredients ? `\n## Ingrédients\n${ingredients}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function productMetadata(p: ShopifyProduct): Record<string, unknown> {
  return {
    handle: p.handle,
    url: p.onlineStoreUrl || `${STOREFRONT_BASE}/products/${p.handle}`,
    price: p.priceRangeV2.minVariantPrice.amount,
    currency: p.priceRangeV2.minVariantPrice.currencyCode,
    available: p.totalInventory > 0,
    image_url: p.featuredImage?.url || null,
  }
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex")
}

export type SyncResult = {
  total: number
  created: number
  updated: number
  unchanged: number
  disabled: number
}

export async function syncProducts(db: SupabaseClient): Promise<SyncResult> {
  const products = await fetchAllProducts()
  const result: SyncResult = { total: products.length, created: 0, updated: 0, unchanged: 0, disabled: 0 }

  const { data: existingDocs } = await db
    .from("kb_documents")
    .select("id, shopify_product_id, content_hash, status")
    .eq("source_type", "shopify_product")
  const byProductId = new Map<string, { id: string; content_hash: string | null; status: string }>()
  for (const doc of existingDocs || []) {
    byProductId.set(String(doc.shopify_product_id), doc)
  }

  const seenIds = new Set<string>()
  for (const product of products) {
    seenIds.add(product.legacyResourceId)
    const text = buildProductText(product)
    const hash = sha256(text)
    const metadata = productMetadata(product)
    const existing = byProductId.get(product.legacyResourceId)

    if (existing && existing.content_hash === hash && existing.status === "indexed") {
      await db.from("kb_chunks").update({ metadata }).eq("document_id", existing.id)
      result.unchanged++
      continue
    }

    let docId: string
    if (existing) {
      docId = existing.id
      await db
        .from("kb_documents")
        .update({ title: product.title, status: "processing", error_message: null })
        .eq("id", docId)
      await db.from("kb_chunks").delete().eq("document_id", docId)
      result.updated++
    } else {
      const { data: created, error } = await db
        .from("kb_documents")
        .insert({
          source_type: "shopify_product",
          title: product.title,
          shopify_product_id: Number(product.legacyResourceId),
          status: "processing",
          tags: ["fiche-produit"],
        })
        .select("id")
        .single()
      if (error || !created) {
        console.error(`kb_documents insert failed for ${product.handle}:`, error?.message)
        continue
      }
      docId = created.id
      result.created++
    }

    try {
      const chunks = chunkText(text)
      const chunkCount = await insertChunks(db, docId, chunks, metadata)
      await db
        .from("kb_documents")
        .update({
          status: "indexed",
          chunk_count: chunkCount,
          content_hash: hash,
          indexed_at: new Date().toISOString(),
        })
        .eq("id", docId)
    } catch (err) {
      await db
        .from("kb_documents")
        .update({ status: "error", error_message: (err as Error).message })
        .eq("id", docId)
    }
  }

  for (const [productId, doc] of Array.from(byProductId.entries())) {
    if (!seenIds.has(productId) && doc.status !== "disabled") {
      await db.from("kb_documents").update({ status: "disabled" }).eq("id", doc.id)
      result.disabled++
    }
  }

  return result
}
