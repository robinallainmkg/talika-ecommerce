// Test à blanc de l'extraction des FAQ de thème : liste ce qui SERAIT indexé,
// sans toucher à la base. Usage : env Shopify posées puis
//   npx tsx scripts/test-theme-faqs-dry.ts
const API_VERSION = "2024-10"
const domain = process.env.SHOPIFY_STORE_DOMAIN!
const token = process.env.SHOPIFY_ACCESS_TOKEN!

async function rest(path: string) {
  const r = await fetch(`https://${domain}/admin/api/${API_VERSION}${path}`, {
    headers: { "X-Shopify-Access-Token": token },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

function extractFaqs(node: unknown, out: { q: string; a: string }[]): void {
  if (Array.isArray(node)) return node.forEach((n) => extractFaqs(n, out))
  if (!node || typeof node !== "object") return
  const record = node as Record<string, unknown>
  const s = record.settings as Record<string, unknown> | undefined
  if (s && typeof s === "object") {
    const texts: Record<string, string> = {}
    for (const [k, v] of Object.entries(s)) if (typeof v === "string" && v.trim().length > 3) texts[k] = v
    const q = texts.heading || texts.title || texts.question
    const a = texts.content || texts.text || texts.answer || texts.row_content
    if (q && a && q.includes("?")) out.push({ q: cleanHtml(q), a: cleanHtml(a) })
  }
  for (const v of Object.values(record)) extractFaqs(v, out)
}

async function main() {
  const themes = await rest("/themes.json?role=main")
  const themeId = themes.themes[0].id
  console.log("thème principal :", themeId, themes.themes[0].name)
  const assets = await rest(`/themes/${themeId}/assets.json`)
  const keys = assets.assets.map((a: { key: string }) => a.key).filter((k: string) => /^templates\/product\..+\.json$/.test(k))
  console.log(`${keys.length} templates produit\n`)
  for (const key of keys) {
    const asset = await rest(`/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`)
    const raw = (asset.asset?.value || "").replace(/^\/\*[\s\S]*?\*\/\s*/, "")
    let faqs: { q: string; a: string }[] = []
    try { extractFaqs(JSON.parse(raw), faqs) } catch { console.log(key, ": JSON invalide"); continue }
    if (faqs.length) {
      console.log(`${key} -> ${faqs.length} Q/R`)
      for (const f of faqs.slice(0, 30)) console.log(`   · ${f.q.slice(0, 90)}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
