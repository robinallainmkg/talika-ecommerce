// Set cluster tags + related_products metafield on the 6 SEO drafts.
import fs from "node:fs"
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN
const BLOG_ID = 89170575612
const gid = (id) => `gid://shopify/Product/${id}`

const PROD = {
  lipocils: 15309404537162, lipocilsPlat: 6123458920644,
  liposourcils: 6094874738884, liposourcilsPlat: 6123456037060,
  eyeTherapy: 6123456495812, bioEnzymes: 6618394099908,
}

// article id → { cluster, products[] }
const rel = {
  1003130650954: { cluster: "sourcils", products: [PROD.liposourcils, PROD.liposourcilsPlat] },
  1003131044170: { cluster: "sourcils", products: [PROD.liposourcils, PROD.liposourcilsPlat] },
  1003130716490: { cluster: "cils", products: [PROD.lipocils, PROD.lipocilsPlat] },
  1003131011402: { cluster: "cils", products: [PROD.lipocils, PROD.lipocilsPlat] },
  1003130683722: { cluster: "regard", products: [PROD.eyeTherapy, PROD.bioEnzymes] },
  1003131076938: { cluster: "regard", products: [PROD.eyeTherapy, PROD.bioEnzymes] },
}

async function setTags(id, cluster) {
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles/${id}.json`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ article: { id, tags: `SEO, ${cluster}` } }),
  })
  if (!res.ok) throw new Error(`tags ${id}: ${(await res.text()).slice(0, 200)}`)
}

async function setRelatedProducts(id, products) {
  const value = JSON.stringify(products.map(gid))
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/blogs/${BLOG_ID}/articles/${id}/metafields.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      metafield: { namespace: "custom", key: "related_products", type: "list.product_reference", value },
    }),
  })
  if (!res.ok) throw new Error(`metafield ${id}: ${(await res.text()).slice(0, 250)}`)
}

for (const [id, r] of Object.entries(rel)) {
  await setTags(id, r.cluster)
  await setRelatedProducts(id, r.products)
  console.log(`OK #${id} — cluster=${r.cluster}, ${r.products.length} produits`)
}
