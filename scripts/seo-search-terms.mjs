// One-off: pull Google Ads search terms (real converting queries) for SEO mining.
// Usage: node scripts/seo-search-terms.mjs
import fs from "node:fs"

// --- load env from .env.local ---
const env = {}
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const CUSTOMER_ID = (env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "")
const API = "v21"

async function token() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  })
  const d = await res.json()
  if (!d.access_token) throw new Error("OAuth: " + JSON.stringify(d))
  return d.access_token
}

async function gaql(query) {
  const t = await token()
  const res = await fetch(
    `https://googleads.googleapis.com/${API}/customers/${CUSTOMER_ID}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  )
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const batches = await res.json()
  return (Array.isArray(batches) ? batches : []).flatMap((b) => b.results || [])
}

const num = (v) => (v == null ? 0 : typeof v === "string" ? parseFloat(v) || 0 : v)

const rows = await gaql(`
  SELECT search_term_view.search_term,
         metrics.impressions, metrics.clicks, metrics.conversions,
         metrics.conversions_value, metrics.cost_micros
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS
  ORDER BY metrics.impressions DESC
  LIMIT 200
`)

// aggregate by term (terms repeat across campaigns)
const agg = {}
for (const r of rows) {
  const m = r.metrics || {}
  const t = r.searchTermView?.searchTerm || "—"
  if (!agg[t]) agg[t] = { term: t, impr: 0, clicks: 0, conv: 0, conv_value: 0, cost: 0 }
  agg[t].impr += num(m.impressions)
  agg[t].clicks += num(m.clicks)
  agg[t].conv += num(m.conversions)
  agg[t].conv_value += num(m.conversionsValue)
  agg[t].cost += num(m.costMicros) / 1e6
}
const list = Object.values(agg).map((x) => ({
  ...x,
  conv: Math.round(x.conv * 10) / 10,
  conv_value: Math.round(x.conv_value),
  cost: Math.round(x.cost * 100) / 100,
}))

const isBrand = (t) => /talika|lipocil|liposourcil|skintelligence|hair ?force/i.test(t)
const brand = list.filter((x) => isBrand(x.term)).sort((a, b) => b.impr - a.impr)
const nonBrand = list.filter((x) => !isBrand(x.term)).sort((a, b) => b.impr - a.impr)

console.log(`\n##### NON-BRAND (${nonBrand.length} termes) — opportunité SEO/SEA #####`)
console.table(nonBrand)
console.log(`\n##### BRAND (${brand.length} termes) #####`)
console.table(brand.slice(0, 15))
