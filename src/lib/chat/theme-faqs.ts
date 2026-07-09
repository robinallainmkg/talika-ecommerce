import crypto from "node:crypto"
import { SupabaseClient } from "@supabase/supabase-js"
import { chunkText } from "./chunking"
import { insertChunks } from "./ingest"

// Les FAQ produit sont saisies dans l'ÉDITEUR DE THÈME (templates/product.*.json),
// pas dans les données produit -> invisibles du sync fiches (vu le 08/07 : la FAQ
// du LED Therapy Mask répondait aux questions que le bot inventait). Ce module
// extrait les Q/R des templates produit du thème publié et les indexe comme
// documents KB (source_type "theme_faq"), au fil des syncs.

const API_VERSION = "2024-10"

function env(): { domain: string; token: string } {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) throw new Error("SHOPIFY_STORE_DOMAIN / SHOPIFY_ACCESS_TOKEN manquants")
  return { domain, token }
}

async function rest(path: string): Promise<Record<string, unknown>> {
  const { domain, token } = env()
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    headers: { "X-Shopify-Access-Token": token },
  })
  if (!response.ok) throw new Error(`Shopify REST ${path}: ${response.status}`)
  return response.json()
}

type Faq = { question: string; answer: string }

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Parcourt le JSON du template : un bloc dont les settings contiennent un
// heading/title/question AVEC « ? » et un corps texte = une entrée de FAQ.
function extractFaqs(node: unknown, out: Faq[]): void {
  if (Array.isArray(node)) {
    for (const child of node) extractFaqs(child, out)
    return
  }
  if (!node || typeof node !== "object") return
  const record = node as Record<string, unknown>
  const settings = record.settings
  if (settings && typeof settings === "object") {
    const s = settings as Record<string, unknown>
    const texts: Record<string, string> = {}
    for (const [key, value] of Object.entries(s)) {
      if (typeof value === "string" && value.trim().length > 3) texts[key] = value
    }
    const question = texts.heading || texts.title || texts.question
    const answer = texts.content || texts.text || texts.answer || texts.row_content
    if (question && answer && question.includes("?")) {
      out.push({ question: cleanHtml(question), answer: cleanHtml(answer) })
    }
  }
  for (const value of Object.values(record)) extractFaqs(value, out)
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex")
}

export type ThemeFaqSyncResult = {
  templates_scanned: number
  faq_docs: number
  created: number
  updated: number
  unchanged: number
  disabled: number
}

export async function syncThemeFaqs(db: SupabaseClient): Promise<ThemeFaqSyncResult> {
  // 1. Thème publié + liste des templates produit
  const themes = (await rest("/themes.json?role=main")) as { themes?: { id: number }[] }
  const themeId = themes.themes?.[0]?.id
  if (!themeId) throw new Error("thème principal introuvable")
  const assets = (await rest(`/themes/${themeId}/assets.json`)) as { assets?: { key: string }[] }
  const templateKeys = (assets.assets || [])
    .map((a) => a.key)
    .filter((k) => /^templates\/product\..+\.json$/.test(k))

  // 2. Suffixe de template -> produit (titre servant de titre de document)
  const { domain, token } = env()
  const products: { handle: string; title: string; templateSuffix: string | null }[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const response: Response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({
        query: `query($cursor: String) { products(first: 100, after: $cursor, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes { handle title templateSuffix } } }`,
        variables: { cursor },
      }),
    })
    const json = (await response.json()) as {
      data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: typeof products } }
    }
    products.push(...json.data.products.nodes)
    if (!json.data.products.pageInfo.hasNextPage) break
    cursor = json.data.products.pageInfo.endCursor
  }
  const bySuffix = new Map(products.filter((p) => p.templateSuffix).map((p) => [p.templateSuffix as string, p]))

  const result: ThemeFaqSyncResult = {
    templates_scanned: templateKeys.length,
    faq_docs: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    disabled: 0,
  }

  const { data: existingDocs } = await db
    .from("kb_documents")
    .select("id, file_name, content_hash, status")
    .eq("source_type", "theme_faq")
  const byTemplate = new Map((existingDocs || []).map((d) => [d.file_name as string, d]))
  const seen = new Set<string>()

  for (const key of templateKeys) {
    const suffix = key.replace(/^templates\/product\./, "").replace(/\.json$/, "")
    const product = bySuffix.get(suffix)
    const asset = (await rest(`/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`)) as {
      asset?: { value?: string }
    }
    const raw = (asset.asset?.value || "").replace(/^\/\*[\s\S]*?\*\/\s*/, "")
    let template: unknown
    try {
      template = JSON.parse(raw)
    } catch {
      continue
    }
    const faqs: Faq[] = []
    extractFaqs(template, faqs)
    if (faqs.length === 0) continue

    result.faq_docs++
    seen.add(key)
    const title = `${product?.title || suffix} — FAQ page produit`
    const text = [
      `# ${title}`,
      `Source : FAQ publiée sur la fiche produit talika.fr${product ? ` (/products/${product.handle})` : ""}. Réponses officielles, à utiliser telles quelles.`,
      "",
      ...faqs.map((f) => `## ${f.question}\n${f.answer}\n`),
    ].join("\n")
    const hash = sha256(text)
    const existing = byTemplate.get(key)

    if (existing && existing.content_hash === hash && existing.status === "indexed") {
      result.unchanged++
      continue
    }

    let docId: string
    if (existing) {
      docId = existing.id
      await db
        .from("kb_documents")
        .update({ title, status: "processing", error_message: null })
        .eq("id", docId)
      await db.from("kb_chunks").delete().eq("document_id", docId)
      result.updated++
    } else {
      const { data: created, error } = await db
        .from("kb_documents")
        .insert({ source_type: "theme_faq", title, file_name: key, status: "processing", tags: ["faq-produit"] })
        .select("id")
        .single()
      if (error || !created) continue
      docId = created.id
      result.created++
    }

    try {
      const chunkCount = await insertChunks(db, docId, chunkText(text), {
        url: product ? `https://talika.fr/products/${product.handle}` : null,
      })
      await db
        .from("kb_documents")
        .update({ status: "indexed", chunk_count: chunkCount, content_hash: hash, indexed_at: new Date().toISOString() })
        .eq("id", docId)
    } catch (err) {
      await db
        .from("kb_documents")
        .update({ status: "error", error_message: (err as Error).message })
        .eq("id", docId)
    }
  }

  for (const [key, doc] of Array.from(byTemplate.entries())) {
    if (!seen.has(key) && doc.status !== "disabled") {
      await db.from("kb_documents").update({ status: "disabled" }).eq("id", doc.id)
      result.disabled++
    }
  }

  return result
}
