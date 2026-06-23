// Build local mockups of the REAL article drafts (theme-like shell) for preview.
import fs from "node:fs"
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN
const BLOG_ID = 89170575612
const H = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" }
const OUT = new URL("../../.preview-mockup/", import.meta.url)

const IDS = [1003130650954, 1003130683722, 1003130716490, 1003131011402, 1003131044170, 1003131076938]

async function getArticle(id) {
  const a = (await (await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles/${id}.json`, { headers: H })).json()).article
  const mf = (await (await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles/${id}/metafields.json`, { headers: H })).json()).metafields || []
  const rel = mf.find((m) => m.namespace === "custom" && m.key === "related_products")
  const prodIds = rel ? JSON.parse(rel.value).map((g) => g.split("/").pop()) : []
  return { ...a, prodIds }
}
async function getProduct(id) {
  const p = (await (await fetch(`https://${DOMAIN}/admin/api/2024-10/products/${id}.json?fields=id,title,handle,image,variants`, { headers: H })).json()).product
  return { title: p.title, handle: p.handle, price: p.variants[0].price, img: (p.image || {}).src || "" }
}

const articles = []
for (const id of IDS) articles.push(await getArticle(id))
const cluster = (a) => (a.tags || "").split(",").map((s) => s.trim()).find((t) => ["cils", "sourcils", "regard", "led", "cou"].includes(t)) || ""
const prodCache = {}
for (const a of articles) for (const pid of a.prodIds) if (!prodCache[pid]) prodCache[pid] = await getProduct(pid)

const euro = (p) => Number(p).toFixed(2).replace(".", ",") + " €"
const SHELL = (a) => {
  const cl = cluster(a)
  const related = articles.filter((x) => x.id !== a.id && cluster(x) === cl).slice(0, 3)
  const fallback = related.length ? related : articles.filter((x) => x.id !== a.id).slice(0, 2)
  const prods = a.prodIds.map((id) => prodCache[id]).filter(Boolean)
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${a.title}</title>
<style>
 :root{--ink:#1a1a1a;--beige:#f7f4ef;}*{box-sizing:border-box;}
 body{margin:0;font-family:Georgia,'Times New Roman',serif;color:var(--ink);background:#fff;}
 .hero{height:300px;background:url('${a.image ? a.image.src : ""}') center/cover;background-color:#e9eef0;}
 .wrap{max-width:1140px;margin:0 auto;padding:40px 24px;display:flex;gap:48px;}
 article{flex:0 0 64%;min-width:0;}aside{flex:1;font-family:system-ui,sans-serif;}
 h1{font-size:2.1em;line-height:1.2;margin:0 0 8px;}
 .meta{color:#888;font-size:.85em;font-family:system-ui,sans-serif;margin-bottom:28px;}
 .content{line-height:1.75;font-size:1.02em;}
 .side-title{font-size:.78em;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin:0 0 8px;}
 hr.s{border:0;border-top:1px solid #e6e6e6;margin:0 0 18px;}
 .side-prod{display:flex;gap:12px;align-items:center;margin-bottom:16px;text-decoration:none;color:inherit;}
 .side-prod img{width:64px;height:64px;object-fit:cover;border-radius:8px;flex:0 0 64px;}
 .side-prod .pn{display:block;font-weight:600;font-size:.9em;line-height:1.3;}
 .side-prod .pp{display:block;font-size:.85em;color:#777;margin-top:2px;}
 .side-art{display:flex;gap:12px;margin-bottom:18px;text-decoration:none;color:inherit;}
 .side-art img{width:80px;height:60px;object-fit:cover;border-radius:8px;flex:0 0 80px;background:#eee;}
 .side-art .at{font-size:.88em;line-height:1.35;font-weight:600;}
 .block{margin-bottom:36px;} .nav{font-family:system-ui,sans-serif;font-size:.85em;padding:12px 24px;background:#faf8f5;}
 .nav a{margin-right:14px;color:#555;}
</style></head><body>
<div class="nav"><strong>Aperçu&nbsp;:</strong> ${articles.map((x) => `<a href="${x.handle}.html">${cluster(x) || "·"}</a>`).join("")} &nbsp;|&nbsp; <a href="index.html">index</a></div>
<div class="hero"></div>
<div class="wrap">
 <article>
   <h1>${a.title}</h1>
   <div class="meta">Talika · brouillon</div>
   <div class="content">${a.body_html}</div>
 </article>
 <aside>
   ${prods.length ? `<div class="block"><p class="side-title">Nos produits associés</p><hr class="s">${prods.map((p) => `<a class="side-prod" href="https://talika.fr/products/${p.handle}"><img src="${p.img}" alt=""><span><span class="pn">${p.title}</span><span class="pp">${euro(p.price)}</span></span></a>`).join("")}</div>` : ""}
   <div class="block"><p class="side-title">À lire aussi</p><hr class="s">${fallback.map((x) => `<a class="side-art" href="${x.handle}.html"><img src="${x.image ? x.image.src : ""}" alt=""><span class="at">${x.title}</span></a>`).join("")}</div>
 </aside>
</div></body></html>`
}

fs.mkdirSync(OUT, { recursive: true })
for (const a of articles) fs.writeFileSync(new URL(`${a.handle}.html`, OUT), SHELL(a))
const index = `<!doctype html><meta charset=utf-8><title>Mockups articles</title><body style="font-family:system-ui;max-width:640px;margin:40px auto;line-height:1.8"><h1>Aperçu des 6 articles</h1><ul>${articles.map((a) => `<li><a href="${a.handle}.html">${a.title}</a> <small style="color:#999">[${cluster(a)}]</small></li>`).join("")}</ul></body>`
fs.writeFileSync(new URL("index.html", OUT), index)
console.log("Mockups générés :", articles.map((a) => a.handle + ".html").join(", "))
