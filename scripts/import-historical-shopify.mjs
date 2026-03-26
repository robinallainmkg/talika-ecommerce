#!/usr/bin/env node
/**
 * Import historical Shopify orders into Supabase data_cache
 * Uses lightweight format (~500 bytes/order instead of ~12KB)
 * Run: node scripts/import-historical-shopify.mjs
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: ".env.local" })

const SHOPIFY_STORE = "talika-cosmetics.myshopify.com"
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/2024-01`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Months to import
const MONTHS_TO_IMPORT = [
  { year: 2024, month: 11 },
  { year: 2024, month: 12 },
  { year: 2025, month: 1 },
  { year: 2025, month: 2 },
  { year: 2025, month: 3 },
  { year: 2025, month: 4 },
  { year: 2025, month: 5 },
  { year: 2025, month: 6 },
  { year: 2025, month: 7 },
  { year: 2025, month: 8 },
  { year: 2025, month: 9 },
  { year: 2025, month: 10 },
  { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 },
  { year: 2026, month: 2 },
]

function getNextPageUrl(linkHeader) {
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

async function fetchAllOrders(startDate, endDate) {
  const allOrders = []
  const query = new URLSearchParams()
  query.set("status", "any")
  query.set("limit", "250")
  query.set("created_at_min", startDate)
  query.set("created_at_max", endDate)

  let nextUrl = `${BASE_URL}/orders.json?${query}`
  let page = 0

  while (nextUrl && page < 40) {
    const res = await fetch(nextUrl, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    })

    if (!res.ok) {
      // Rate limit handling
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after") || "2"
        console.log(`  ⏳ Rate limited, waiting ${retryAfter}s...`)
        await new Promise(r => setTimeout(r, parseInt(retryAfter) * 1000 + 500))
        continue
      }
      throw new Error(`Shopify API error: ${res.status} ${await res.text()}`)
    }

    const data = await res.json()
    const linkHeader = res.headers.get("link") || ""
    const orders = data.orders || []
    allOrders.push(...orders)
    page++

    console.log(`  Page ${page}: ${orders.length} orders (total: ${allOrders.length})`)

    if (orders.length < 250) break
    nextUrl = getNextPageUrl(linkHeader)

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500))
  }

  return allOrders
}

function toLightweight(order) {
  return {
    id: order.id,
    email: order.email || "",
    total_price: order.total_price,
    total_discounts: order.total_discounts,
    created_at: order.created_at,
    financial_status: order.financial_status,
    discount_codes: (order.discount_codes || []).map(dc => ({
      code: typeof dc === "string" ? dc : dc.code || "",
      amount: typeof dc === "string" ? "0" : dc.amount || "0",
      type: typeof dc === "string" ? "" : dc.type || "",
    })),
    discount_applications: (order.discount_applications || []).map(da => ({
      target_type: da.target_type,
      type: da.type,
      value: da.value,
    })),
    line_items: (order.line_items || []).map(li => ({
      product_id: li.product_id,
      title: li.title,
      variant_id: li.variant_id,
      variant_title: li.variant_title,
      sku: li.sku,
      quantity: li.quantity,
      price: li.price,
      compare_at_price: li.compare_at_price,
    })),
    shipping_lines: (order.shipping_lines || []).map(sl => ({
      title: sl.title,
      price: sl.price,
    })),
  }
}

async function importMonth(year, month) {
  const key = `shopify_orders_${year}_${month}`
  const startDate = new Date(year, month - 1, 1).toISOString()
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

  console.log(`\n📦 Importing ${year}-${String(month).padStart(2, "0")} (${startDate.slice(0,10)} → ${endDate.slice(0,10)})...`)

  // Check if already exists
  const { data: existing } = await supabase
    .from("data_cache")
    .select("key")
    .eq("key", key)
    .single()

  if (existing) {
    console.log(`  ⏭️  Already exists, skipping`)
    return { skipped: true }
  }

  const rawOrders = await fetchAllOrders(startDate, endDate)
  const orders = rawOrders.map(toLightweight)

  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price || "0"), 0)
  const dataStr = JSON.stringify({ orders, count: orders.length })
  console.log(`  📊 ${orders.length} orders | ${totalRevenue.toFixed(0)}€ | ${(dataStr.length / 1024).toFixed(0)}KB`)

  const { error } = await supabase.from("data_cache").upsert({
    key,
    data: { orders, count: orders.length },
    source: "shopify",
    expires_at: new Date("2099-12-31").toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" })

  if (error) {
    console.error(`  ❌ Error: ${error.message}`)
    return { error: error.message }
  }

  console.log(`  ✅ Saved to data_cache`)
  return { orders: orders.length, revenue: totalRevenue }
}

async function main() {
  console.log("🚀 Starting historical Shopify import...")
  console.log(`📅 ${MONTHS_TO_IMPORT.length} months to import\n`)

  const results = []
  for (const { year, month } of MONTHS_TO_IMPORT) {
    try {
      const result = await importMonth(year, month)
      results.push({ year, month, ...result })
      // Pause between months to avoid DB saturation
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`)
      results.push({ year, month, error: err.message })
    }
  }

  console.log("\n\n📋 RÉSUMÉ:")
  console.log("=".repeat(50))
  for (const r of results) {
    const label = `${r.year}-${String(r.month).padStart(2, "0")}`
    if (r.skipped) console.log(`  ${label}: ⏭️  déjà importé`)
    else if (r.error) console.log(`  ${label}: ❌ ${r.error}`)
    else console.log(`  ${label}: ✅ ${r.orders} commandes | ${r.revenue?.toFixed(0)}€`)
  }
}

main().catch(console.error)
