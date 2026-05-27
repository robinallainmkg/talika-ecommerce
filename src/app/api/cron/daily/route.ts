/**
 * GET /api/cron/daily
 *
 * Vercel Cron job — runs every day at 7am Paris time.
 * Syncs Shopify data so all dashboard pages stay fresh automatically.
 *
 * Steps:
 * 1. Sync orders for current month (feeds generosite + objectives + influencers)
 * 2. Sync discount codes from Shopify (for unassigned code detection)
 * 3. Sync influencer product sales
 * 4. Update objectives generosite rates
 * 5. Sync Klaviyo (campaigns, flows, lists)
 * 6. Sync Google Ads (campaigns + metrics)
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAllOrders, getDiscountCodes } from "@/lib/integrations/shopify"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min max for Vercel Pro

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const log: string[] = []
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  try {
    // ── 1. Sync orders for current month ──
    log.push(`Fetching orders for ${year}-${month}...`)
    const rawOrders = await getAllOrders({
      created_at_min: new Date(year, month - 1, 1).toISOString(),
      created_at_max: now.toISOString(),
    })

    const orders = rawOrders.map((o: any) => ({
      id: o.id,
      email: o.email || "",
      total_price: o.total_price,
      total_discounts: o.total_discounts,
      financial_status: o.financial_status,
      cancelled_at: o.cancelled_at,
      created_at: o.created_at,
      discount_codes: (o.discount_codes || []).map((dc: any) => ({
        code: typeof dc === "string" ? dc : dc.code || "",
        amount: typeof dc === "string" ? "0" : dc.amount || "0",
        type: typeof dc === "string" ? "" : dc.type || "",
      })),
      discount_applications: (o.discount_applications || []).map((da: any) => ({
        target_type: da.target_type,
        type: da.type,
        value: da.value,
      })),
      line_items: (o.line_items || []).map((li: any) => ({
        product_id: li.product_id,
        title: li.title,
        variant_id: li.variant_id,
        variant_title: li.variant_title,
        sku: li.sku,
        quantity: li.quantity,
        price: li.price,
        compare_at_price: li.compare_at_price,
      })),
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({
        title: sl.title,
        price: sl.price,
      })),
      refunds: o.refunds,
    }))

    await supabase.from("data_cache").upsert({
      key: `shopify_orders_${year}_${month}`,
      data: { orders, count: orders.length },
      source: "shopify",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "key" })
    log.push(`Cached ${orders.length} orders for ${year}-${month}`)

    // ── 2. Sync discount codes from Shopify ──
    log.push("Fetching discount codes...")
    const discountCodes = await getDiscountCodes()
    await supabase.from("data_cache").upsert({
      key: `shopify_discount_codes_${year}`,
      data: discountCodes,
      source: "shopify",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "key" })
    log.push(`Cached ${discountCodes.length} discount codes`)

    // ── 2b. Auto-classify random codes as "auto_discounts" ──
    const { data: knownCodes } = await supabase
      .from("influencer_codes")
      .select("code")
    const knownSet = new Set((knownCodes || []).map(c => c.code.toUpperCase()))

    const randomPattern = /^[A-Z0-9]{8,}$/
    const randomCodes = discountCodes.filter((dc: any) => {
      const upper = (dc.code || "").toUpperCase().trim()
      if (knownSet.has(upper)) return false
      // Random = 8+ alphanumeric chars, no readable words (no vowel clusters)
      if (!randomPattern.test(upper)) return false
      // Extra check: if it contains a common word pattern, it's probably not random
      if (/[A-Z]{3,}/.test(upper) && /[AEIOU]{2,}/.test(upper)) return false
      return true
    })

    let autoClassified = 0
    for (const dc of randomCodes) {
      const { error } = await supabase.from("influencer_codes").insert({
        code: dc.code.toUpperCase().trim(),
        code_type: "auto_discounts",
        discount_percent: 0,
        is_active: true,
      })
      if (!error) autoClassified++
    }
    if (autoClassified > 0) {
      log.push(`Auto-classified ${autoClassified} random codes as "Remises automatiques"`)
    }

    // ── 3. Sync influencer product sales ──
    log.push("Syncing influencer sales...")
    const { data: infCodes } = await supabase
      .from("influencer_codes")
      .select("code, influencer_id")
      .eq("is_active", true)
      .eq("code_type", "influencer")

    let matchedOrders = 0
    let syncedProducts = 0
    if (infCodes && infCodes.length > 0) {
      const codeMap = new Map(infCodes.map(c => [c.code.toUpperCase(), c.influencer_id]))

      for (const order of orders) {
        for (const dc of (order.discount_codes || [])) {
          const code = (dc.code || "").toUpperCase().trim()
          const influencerId = codeMap.get(code)
          if (!influencerId) continue
          matchedOrders++

          for (const item of (order.line_items || [])) {
            const { error } = await supabase
              .from("influencer_product_sales")
              .insert({
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
                line_price: parseFloat(item.price || "0") * (item.quantity || 1),
              })
            if (error?.code === "23505") continue // duplicate
            if (!error) syncedProducts++
          }
        }
      }
    }
    log.push(`Influencer sales: ${matchedOrders} matched orders, ${syncedProducts} new products`)

    // ── 4. Trigger objectives generosite sync ──
    log.push("Updating objectives generosite...")
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"
      const objRes = await fetch(`${baseUrl}/api/objectives/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const objData = await objRes.json()
      if (objData.success) {
        log.push(`Objectives updated: ${objData.orders_fetched} orders processed`)
      } else {
        log.push(`Objectives sync warning: ${objData.error || "unknown"}`)
      }
    } catch (objErr) {
      log.push(`Objectives sync skipped: ${objErr instanceof Error ? objErr.message : "unknown error"}`)
    }

    // ── 5. Sync Klaviyo (campaigns, flows, lists) ──
    log.push("Syncing Klaviyo...")
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"
      const klavRes = await fetch(`${baseUrl}/api/klaviyo/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const klavData = await klavRes.json()
      if (klavData.success) {
        log.push(`Klaviyo synced: ${klavData.results.campaigns_count} campaigns, ${klavData.results.flows_count} flows, ${klavData.results.lists_count} lists`)
      } else {
        log.push(`Klaviyo sync warning: ${klavData.error || "unknown"}`)
      }
    } catch (klavErr) {
      log.push(`Klaviyo sync skipped: ${klavErr instanceof Error ? klavErr.message : "unknown error"}`)
    }

    // ── 6. Sync Google Ads (if configured) ──
    log.push("Syncing Google Ads...")
    try {
      const baseUrl2 = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"
      const gRes = await fetch(`${baseUrl2}/api/google/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const gData = await gRes.json()
      if (gData.success) {
        log.push(`Google Ads synced: ${gData.campaigns} campaigns, ROAS ${gData.summary?.roas || "—"}`)
      } else {
        log.push(`Google Ads sync warning: ${gData.error || "unknown"}`)
      }
    } catch (gErr) {
      log.push(`Google Ads sync skipped: ${gErr instanceof Error ? gErr.message : "unknown error"}`)
    }

    // ── 7. Log sync result ──
    await supabase.from("data_cache").upsert({
      key: "last_cron_sync",
      data: {
        ran_at: now.toISOString(),
        orders_count: orders.length,
        discount_codes_count: discountCodes.length,
        influencer_matched: matchedOrders,
        log,
      },
      source: "cron",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "key" })

    return NextResponse.json({ success: true, log })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    log.push(`ERROR: ${msg}`)
    return NextResponse.json({ success: false, error: msg, log }, { status: 500 })
  }
}
