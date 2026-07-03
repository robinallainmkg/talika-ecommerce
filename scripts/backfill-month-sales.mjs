// Backfill d'UN MOIS d'attribution influenceurs (influencer_product_sales)
// depuis l'API Shopify — pour un mois jamais attribué (ex. avril 2026, trou
// constaté le 03/07/2026). Même logique que le cron (run-all) : commandes
// portant un code influenceur actif → 1 ligne par line item, line_price =
// TTC APRÈS remise (prix − discount_allocations). Dédup par
// (shopify_order_id, product_id, variant_id) comme l'index unique.
// Usage : node scripts/backfill-month-sales.mjs 2026-04           → DRY-RUN
//         node scripts/backfill-month-sales.mjs 2026-04 --apply   → insère
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const [, , ym, applyFlag] = process.argv
const APPLY = applyFlag === "--apply"
const m = (ym || "").match(/^(\d{4})-(\d{2})$/)
if (!m) { console.error("Usage: node scripts/backfill-month-sales.mjs YYYY-MM [--apply]"); process.exit(1) }
const [year, month] = [Number(m[1]), Number(m[2])]
const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`
const end = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01T00:00:00Z`

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SHOP = env.SHOPIFY_STORE_DOMAIN, TOKEN = env.SHOPIFY_ACCESS_TOKEN

// 1. Codes influenceurs (mêmes filtres que le cron)
const { data: infCodes } = await supabase
  .from("influencer_codes")
  .select("code, influencer_id")
  .eq("is_active", true)
  .eq("code_type", "influencer")
const codeMap = new Map((infCodes || []).map((c) => [c.code.toUpperCase().trim(), c.influencer_id]))
console.log(`${codeMap.size} codes influenceurs actifs`)

// 2. Commandes du mois
const orders = []
let url = `https://${SHOP}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(start)}&created_at_max=${encodeURIComponent(end)}&fields=id,created_at,discount_codes,line_items`
while (url) {
  const res = await fetch(url, { headers: { "X-Shopify-Access-Token": TOKEN } })
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue }
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
  const j = await res.json()
  orders.push(...(j.orders || []))
  const next = (res.headers.get("link") || "").split(",").find((p) => p.includes('rel="next"'))
  url = next ? next.match(/<([^>]+)>/)?.[1] : null
  await new Promise((r) => setTimeout(r, 550))
}
console.log(`${orders.length} commandes ${year}-${String(month).padStart(2, "0")}`)

// 3. Lignes candidates (net TTC après remise, comme run-all post-89545ee)
const candidates = []
for (const order of orders) {
  for (const dc of order.discount_codes || []) {
    const code = (dc.code || "").toUpperCase().trim()
    const influencerId = codeMap.get(code)
    if (!influencerId) continue
    for (const item of order.line_items || []) {
      const gross = parseFloat(item.price || "0") * (item.quantity || 1)
      const disc = (item.discount_allocations || []).reduce((s, a) => s + (parseFloat(a.amount || "0") || 0), 0)
      candidates.push({
        influencer_id: influencerId,
        discount_code: code,
        shopify_order_id: String(order.id),
        order_date: order.created_at,
        product_id: String(item.product_id),
        product_title: item.title || "Unknown",
        variant_id: item.variant_id ? String(item.variant_id) : null,
        variant_title: item.variant_title || null,
        sku: item.sku || null,
        quantity: item.quantity || 1,
        line_price: Math.max(0, gross - disc),
      })
    }
    break // 1 influenceuse par commande (premier code matché, comme le cron)
  }
}

// 4. Dédup vs base (clé de l'index unique) + dédup interne
const keyOf = (r) => `${r.shopify_order_id}|${r.product_id}|${r.variant_id ?? ""}`
const { data: existing } = await supabase
  .from("influencer_product_sales")
  .select("shopify_order_id, product_id, variant_id")
  .gte("order_date", start)
  .lt("order_date", end)
const seen = new Set((existing || []).map(keyOf))
const toInsert = []
for (const c of candidates) {
  const k = keyOf(c)
  if (seen.has(k)) continue
  seen.add(k)
  toInsert.push(c)
}
const total = toInsert.reduce((s, r) => s + r.line_price, 0)
console.log(`${candidates.length} lignes candidates → ${toInsert.length} nouvelles (${(existing || []).length} déjà en base) · ${total.toFixed(2)} € net TTC`)

if (!APPLY) { console.log("DRY-RUN — rien écrit. Relance avec --apply."); process.exit(0) }
for (let i = 0; i < toInsert.length; i += 500) {
  const { error } = await supabase.from("influencer_product_sales").insert(toInsert.slice(i, i + 500))
  if (error) throw new Error(error.message)
}
console.log(`✅ ${toInsert.length} lignes insérées pour ${ym}.`)
