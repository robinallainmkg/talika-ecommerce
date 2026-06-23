// Push optimized SEO metas (title_tag + description_tag) to Talika products.
// LIVE on prod — run ONLY after Robin validates SEO-PRODUCT-META-PROPOSAL.md.
// Usage: node scripts/seo-push-product-metas.mjs
import fs from "node:fs"
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const DOMAIN = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN

// product_id → { title, desc }
const metas = {
  15309404537162: { title: "Lipocils Expert : sérum pousse des cils sans prostaglandine", desc: "Sérum culte Talika qui stimule la pousse, la courbure et la pigmentation des cils. Sans prostaglandine. Plus de 8M d'unités vendues." },
  6094874738884: { title: "Liposourcils Expert : sérum sourcils repousse & densité", desc: "Sérum sourcils Talika qui stimule la croissance et ravive la pigmentation pour des sourcils plus fournis et dessinés. Sans prostaglandine." },
  6123456495812: { title: "Eye Therapy Patch : patch yeux réutilisable anti-fatigue", desc: "Patch yeux réutilisable Talika : huiles végétales, céramides, karité. Regard défatigué, hydraté et lissé en 15 min. Rinçable et durable." },
  6618394099908: { title: "Bio Enzymes Eye Patch : patch yeux ultra-hydratant", desc: "Patch contour des yeux ultra-hydratant Talika pour défatiguer le regard et lisser les ridules de déshydratation. Effet frais immédiat." },
  6123458920644: { title: "Lipocils Platinium : sérum cils expert longueur & volume", desc: "Sérum cils Talika pour des cils visiblement plus longs, courbés et intenses. Sans prostaglandine, formule experte." },
  6123456037060: { title: "Liposourcils Platinium : sérum sourcils expert", desc: "Soin sourcils expert Talika : stimule la croissance et la densité pour des sourcils plus fournis. Sans prostaglandine." },
  // LED — décommenter SEULEMENT après validation des claims :
  // 15521217773898: { title: "LED Therapy Mask : masque LED visage anti-âge Talika", desc: "Masque LED visage nouvelle génération Talika : luminothérapie pour un teint plus ferme, lumineux et lissé." },
  // 8495357165898: { title: "Hair Force LED Cap : casque LED cheveux Talika", desc: "Casque LED cheveux Talika : luminothérapie au service de la densité et de la vitalité capillaire. Usage à domicile." },
}

async function setMeta(pid, key, value) {
  const res = await fetch(`https://${DOMAIN}/admin/api/2024-10/products/${pid}/metafields.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ metafield: { namespace: "global", key, type: "single_line_text_field", value } }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`${pid} ${key}: ${JSON.stringify(j).slice(0, 200)}`)
}

for (const [pid, m] of Object.entries(metas)) {
  await setMeta(pid, "title_tag", m.title)
  await setMeta(pid, "description_tag", m.desc)
  console.log(`OK ${pid} — ${m.title}`)
}
console.log("\nNote: 'global' metafields écrasent le SEO title/description Shopify de la fiche.")
