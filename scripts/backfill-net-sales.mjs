// Backfill : revalorise influencer_product_sales.line_price en TTC APRÈS remise
// (prix catalogue − discount_allocations), depuis l'API Shopify (source exacte —
// les caches d'avant juillet 2026 ne portent pas les allocations).
// Usage :  node scripts/backfill-net-sales.mjs          → DRY-RUN (rapport, zéro écriture)
//          node scripts/backfill-net-sales.mjs --apply  → applique les UPDATEs
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const APPLY = process.argv.includes("--apply")
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SHOP = env.SHOPIFY_STORE_DOMAIN
const TOKEN = env.SHOPIFY_ACCESS_TOKEN

// ── 1. Toutes les lignes à revaloriser ──
async function fetchAllRows() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("influencer_product_sales")
      .select("id, shopify_order_id, product_id, variant_id, quantity, line_price, order_date")
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

// ── 2. Commandes Shopify par fenêtres (Link header pagination) ──
async function fetchOrders(minISO, maxISO) {
  const byId = new Map()
  let url = `https://${SHOP}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(minISO)}&created_at_max=${encodeURIComponent(maxISO)}&fields=id,line_items`
  while (url) {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": TOKEN } })
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue }
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
    const { orders } = await res.json()
    for (const o of orders || []) byId.set(String(o.id), o.line_items || [])
    const link = res.headers.get("link") || ""
    const next = link.split(",").find((p) => p.includes('rel="next"'))
    url = next ? next.match(/<([^>]+)>/)?.[1] : null
    await new Promise((r) => setTimeout(r, 550)) // ~2 req/s
  }
  return byId
}

const rows = await fetchAllRows()
console.log(`${rows.length} lignes en base · ${new Set(rows.map((r) => r.shopify_order_id)).size} commandes distinctes`)

// Fenêtre = bornes réelles des order_date (+ marge 2 j de chaque côté)
const dates = rows.map((r) => new Date(r.order_date).getTime())
const min = new Date(Math.min(...dates) - 2 * 864e5).toISOString()
const max = new Date(Math.max(...dates) + 2 * 864e5).toISOString()
console.log(`Fetch Shopify ${min.slice(0, 10)} → ${max.slice(0, 10)}…`)
const orderLines = await fetchOrders(min, max)
console.log(`${orderLines.size} commandes Shopify chargées`)

// ── 3. Recalcul net par ligne ──
const updates = []
let notFoundOrder = 0, notFoundLine = 0, unchanged = 0
const deltaByMonth = new Map()
for (const r of rows) {
  const lines = orderLines.get(String(r.shopify_order_id))
  if (!lines) { notFoundOrder++; continue }
  const li = lines.find(
    (l) => String(l.product_id) === String(r.product_id) && String(l.variant_id ?? "") === String(r.variant_id ?? "")
  )
  if (!li) { notFoundLine++; continue }
  const gross = parseFloat(li.price || "0") * (li.quantity || 1)
  const disc = (li.discount_allocations || []).reduce((s, a) => s + (parseFloat(a.amount || "0") || 0), 0)
  const net = Math.round(Math.max(0, gross - disc) * 100) / 100
  const cur = Math.round(parseFloat(r.line_price || "0") * 100) / 100
  if (Math.abs(net - cur) < 0.01) { unchanged++; continue }
  updates.push({ id: r.id, net })
  const mk = String(r.order_date).slice(0, 7)
  const d = deltaByMonth.get(mk) || { avant: 0, apres: 0, n: 0 }
  d.avant += cur; d.apres += net; d.n++
  deltaByMonth.set(mk, d)
}

console.log(`\n→ ${updates.length} lignes à corriger · ${unchanged} déjà justes · ${notFoundOrder} commandes introuvables · ${notFoundLine} lignes produit introuvables`)
for (const [mk, d] of [...deltaByMonth].sort()) {
  console.log(`  ${mk} : ${d.n} lignes · ${d.avant.toFixed(0)}€ → ${d.apres.toFixed(0)}€ (${(d.apres - d.avant).toFixed(0)}€)`)
}

if (!APPLY) { console.log("\nDRY-RUN — rien écrit. Relance avec --apply pour appliquer."); process.exit(0) }

// ── 4. UPDATEs par petits lots ──
let done = 0
for (let i = 0; i < updates.length; i += 20) {
  await Promise.all(
    updates.slice(i, i + 20).map((u) =>
      supabase.from("influencer_product_sales").update({ line_price: u.net }).eq("id", u.id)
        .then(({ error }) => { if (error) throw new Error(`${u.id}: ${error.message}`); done++ })
    )
  )
  if (done % 500 < 20) console.log(`  …${done}/${updates.length}`)
}
console.log(`✅ ${done} lignes mises à jour (TTC après remise).`)
