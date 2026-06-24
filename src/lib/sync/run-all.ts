/**
 * runFullSync — orchestrateur de synchronisation partagé.
 *
 * UNE seule implémentation du pipeline complet, appelée par :
 *  - le cron quotidien  : GET /api/cron/daily  (trigger "cron", auth CRON_SECRET)
 *  - le bouton dashboard : POST /api/sync/all   (trigger "manual", auth session)
 *
 * Robustesse : CHAQUE étape est isolée dans son propre try/catch. Une source qui
 * échoue n'arrête plus les suivantes, et on écrit TOUJOURS `last_cron_sync` avec
 * le statut par source (ok/erreur + durée) — même en cas d'échec partiel. Ainsi
 * l'indicateur de fraîcheur du dashboard ne ment jamais par omission.
 *
 * Appels in-process (PAS de fetch HTTP) : VERCEL_URL est protégé par la Deployment
 * Protection → renverrait du HTML ("Unexpected token '<'"). On invoque directement
 * les handlers POST dans le même lambda.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getAllOrders, getDiscountCodes, getVariantPriceMap } from "@/lib/integrations/shopify"
import { POST as syncObjectivesRoute } from "@/app/api/objectives/sync/route"
import { POST as syncKlaviyoRoute } from "@/app/api/klaviyo/sync/route"
import { POST as syncGoogleRoute } from "@/app/api/google/sync/route"
import { POST as syncMetaRoute } from "@/app/api/meta/sync/route"

export interface SyncStep {
  key: string
  label: string
  status: "ok" | "error"
  detail: string
  ms: number
}

export interface SyncResult {
  success: boolean
  trigger: "cron" | "manual"
  ran_at: string
  duration_ms: number
  orders_count: number
  discount_codes_count: number
  influencer_matched: number
  steps: SyncStep[]
  log: string[]
}

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function runFullSync(opts?: { trigger?: "cron" | "manual" }): Promise<SyncResult> {
  const trigger = opts?.trigger ?? "manual"
  const supabase = getServiceClient()
  const startedAt = Date.now()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const steps: SyncStep[] = []
  const log: string[] = []

  // État partagé entre étapes
  let orders: any[] = []
  let ordersCount = 0
  let discountCodesCount = 0
  let matchedOrders = 0

  /** Exécute une étape isolée : la trace toujours, ne propage jamais l'erreur. */
  async function step(key: string, label: string, fn: () => Promise<string>) {
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps.push({ key, label, status: "ok", detail, ms: Date.now() - t0 })
      log.push(`✓ ${label} — ${detail}`)
    } catch (e) {
      const detail = e instanceof Error ? e.message : "erreur inconnue"
      steps.push({ key, label, status: "error", detail, ms: Date.now() - t0 })
      log.push(`✗ ${label} — ${detail}`)
    }
  }

  // ── 1. Commandes Shopify (mois en cours) ──
  await step("shopify_orders", "Commandes Shopify", async () => {
    const rawOrders = await getAllOrders({
      created_at_min: new Date(year, month - 1, 1).toISOString(),
      created_at_max: now.toISOString(),
    })

    // Les line items de commande Shopify ne portent pas le compare_at_price → on
    // enrichit avec le compare_at ACTUEL de la variante (prix barrés / soldes).
    // Sans ça, la générosité "Prix barrés" reste à 0 sur le mois en cours.
    const variantPriceMap = await getVariantPriceMap()

    orders = rawOrders.map((o: any) => ({
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
        compare_at_price: li.compare_at_price || variantPriceMap.get(li.variant_id) || null,
      })),
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({
        title: sl.title,
        price: sl.price,
      })),
      refunds: o.refunds,
    }))
    ordersCount = orders.length

    await supabase.from("data_cache").upsert(
      {
        key: `shopify_orders_${year}_${month}`,
        data: { orders, count: orders.length },
        source: "shopify",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "key" }
    )
    return `${orders.length} commandes (${year}-${month})`
  })

  // ── 2. Codes promo Shopify + auto-classification des codes random ──
  await step("shopify_discount_codes", "Codes promo Shopify", async () => {
    const discountCodes = await getDiscountCodes()
    discountCodesCount = discountCodes.length

    await supabase.from("data_cache").upsert(
      {
        key: `shopify_discount_codes_${year}`,
        data: discountCodes,
        source: "shopify",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "key" }
    )

    // Auto-classer les codes random en "auto_discounts"
    const { data: knownCodes } = await supabase.from("influencer_codes").select("code")
    const knownSet = new Set((knownCodes || []).map((c) => c.code.toUpperCase()))

    const randomPattern = /^[A-Z0-9]{8,}$/
    const randomCodes = discountCodes.filter((dc: any) => {
      const upper = (dc.code || "").toUpperCase().trim()
      if (knownSet.has(upper)) return false
      if (!randomPattern.test(upper)) return false
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
    return `${discountCodes.length} codes${autoClassified ? `, ${autoClassified} auto-classés` : ""}`
  })

  // ── 3. Ventes produits influenceurs (matching codes × commandes) ──
  await step("influencer_sales", "Ventes influenceurs", async () => {
    const { data: infCodes } = await supabase
      .from("influencer_codes")
      .select("code, influencer_id")
      .eq("is_active", true)
      .eq("code_type", "influencer")

    let syncedProducts = 0
    matchedOrders = 0
    if (infCodes && infCodes.length > 0) {
      const codeMap = new Map(infCodes.map((c) => [c.code.toUpperCase(), c.influencer_id]))

      for (const order of orders) {
        for (const dc of order.discount_codes || []) {
          const code = (dc.code || "").toUpperCase().trim()
          const influencerId = codeMap.get(code)
          if (!influencerId) continue
          matchedOrders++

          for (const item of order.line_items || []) {
            const { error } = await supabase.from("influencer_product_sales").insert({
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
            if (error?.code === "23505") continue // doublon
            if (!error) syncedProducts++
          }
        }
      }
    }
    return `${matchedOrders} commandes matchées, ${syncedProducts} nouveaux produits`
  })

  // ── 4. Objectifs / générosité ──
  await step("objectives", "Objectifs (générosité)", async () => {
    const objData = await (await syncObjectivesRoute()).json()
    if (!objData.success) throw new Error(objData.error || "échec sync objectifs")
    return `${objData.orders_fetched ?? "ok"} commandes traitées`
  })

  // ── 4b. Campagne d'influence du mois (auto-créée + auto-remplie) ──
  // Toute influenceuse avec une vente/un coût ce mois apparaît dans la campagne du mois.
  await step("monthly_campaign", "Campagne influence du mois", async () => {
    const { syncMonthlyCampaign } = await import("@/lib/influence/monthly-campaign")
    const r = await syncMonthlyCampaign(supabase, year, month)
    return `${r.name} : ${r.total_active} actives${r.added ? `, ${r.added} ajoutée(s)` : ""}${r.created ? " (créée)" : ""}`
  })

  // ── 5. Klaviyo (campagnes, flows, listes) ──
  await step("klaviyo", "Klaviyo", async () => {
    const klavData = await (await syncKlaviyoRoute()).json()
    if (!klavData.success) throw new Error(klavData.error || "échec sync Klaviyo")
    const r = klavData.results || {}
    return `${r.campaigns_count} campagnes, ${r.flows_count} flows, ${r.lists_count} listes`
  })

  // ── 6. Google Ads ──
  await step("google_ads", "Google Ads", async () => {
    const googleReq = new Request("http://internal/api/google/sync", { method: "POST" })
    const gData = await (await syncGoogleRoute(googleReq)).json()
    if (!gData.success) throw new Error(gData.error || "échec sync Google Ads")
    const months = (gData.months || []).map((m: { month: number; spend: number }) => `${m.month}:${m.spend}€`).join(" · ")
    return `${gData.campaigns} campagnes, ROAS ${gData.summary?.roas ?? "—"}${months ? ` (${months})` : ""}`
  })

  // ── 7. Meta Ads (mois courant + mois précédent) ──
  // Le mois courant est partiel (month-to-date) ; le précédent doit être figé sur
  // son spend RÉEL une fois clos. On le resynchronise chaque jour → il se verrouille
  // sur le total complet (sinon il reste gelé sur le dernier partial → spend faux).
  await step("meta_ads", "Meta Ads", async () => {
    const prev = new Date(year, month - 2, 1)
    const targets = [
      { year, month },
      { year: prev.getFullYear(), month: prev.getMonth() + 1 },
    ]
    const out: string[] = []
    for (const t of targets) {
      const metaReq = new Request("http://internal/api/meta/sync", {
        method: "POST",
        body: JSON.stringify({ year: t.year, month: t.month }),
        headers: { "Content-Type": "application/json" },
      })
      const metaData = await (await syncMetaRoute(metaReq)).json()
      if (!metaData.success) throw new Error(metaData.error || `échec sync Meta ${t.year}-${t.month}`)
      const r = metaData.results || {}
      out.push(`${t.year}-${t.month}: ${r.summary?.spend ?? "?"}€ (ROAS ${r.summary?.roas ?? "—"})`)
    }
    return out.join(" · ")
  })

  // ── 8. Catalogue Shopify → KB chat IA ──
  await step("chat_kb", "Catalogue → KB chat", async () => {
    const { syncProducts } = await import("@/lib/chat/shopify-products")
    const kb = await syncProducts(supabase)
    return `${kb.total} produits (${kb.created} créés, ${kb.updated} maj, ${kb.disabled} désactivés)`
  })

  // ── 9. P&L : (re)calcul des lignes auto (CA Shopify, Meta, Google, Influence) ──
  await step("pnl_auto", "P&L auto", async () => {
    const { syncPnLAuto } = await import("@/lib/sync/pnl-auto")
    const r = await syncPnLAuto(supabase, year)
    return `${r.written} cellules calculées${r.frozen ? `, ${r.frozen} figées (manuel)` : ""}`
  })

  // ── 9b. Nettoyage : conversations chat vides > 24 h (non bloquant, non tracé) ──
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from("chat_conversations")
      .delete()
      .eq("message_count", 0)
      .lt("created_at", dayAgo)
  } catch {
    // non bloquant
  }

  // ── 10. Trace finale : last_cron_sync (toujours écrit, même en échec partiel) ──
  const success = steps.every((s) => s.status === "ok")
  const result: SyncResult = {
    success,
    trigger,
    ran_at: now.toISOString(),
    duration_ms: Date.now() - startedAt,
    orders_count: ordersCount,
    discount_codes_count: discountCodesCount,
    influencer_matched: matchedOrders,
    steps,
    log,
  }

  await supabase.from("data_cache").upsert(
    {
      key: "last_cron_sync",
      data: result,
      source: trigger === "cron" ? "cron" : "manual",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "key" }
  )

  return result
}
