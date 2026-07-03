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
import { POST as syncAmazonRoute } from "@/app/api/amazon/sync/route"
import { GET as runWeeklyAnalysis } from "@/app/api/analysis/weekly/route"
import { isAmazonConfigured } from "@/lib/integrations/amazon"
import { isAmazonAdsConfigured } from "@/lib/integrations/amazon-ads"

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
  let prevOrders: any[] = []
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

  // ── 1. Commandes Shopify (mois en cours + mois précédent) ──
  // Même principe que Meta/Google : le mois courant est partiel (month-to-date) et
  // le mois PRÉCÉDENT doit se verrouiller sur son contenu COMPLET une fois clos.
  // Avant, un mois clôturé restait figé au dernier cron du mois (~7h le dernier
  // jour) → ~17 h de ventes manquantes à jamais (cache commandes, donc aussi NC,
  // générosité, et ventes influence jamais matchées). On écrit AUSSI le cache
  // shopify_analytics_* des deux mois (avant : seuls les syncs manuels l'écrivaient
  // → snapshot partiel figé qui empoisonnait acquisition/dashboard/sales/P&L).
  const prevStart = new Date(year, month - 2, 1)
  const prevYear = prevStart.getFullYear()
  const prevMonth = prevStart.getMonth() + 1
  const currentStart = new Date(year, month - 1, 1)

  await step("shopify_orders", "Commandes Shopify", async () => {
    // Les line items de commande Shopify ne portent pas le compare_at_price → on
    // enrichit avec le compare_at ACTUEL de la variante (prix barrés / soldes).
    // Sans ça, la générosité "Prix barrés" reste à 0 sur le mois en cours.
    const variantPriceMap = await getVariantPriceMap()

    const mapOrder = (o: any) => ({
      id: o.id,
      email: o.email || "",
      total_price: o.total_price,
      total_discounts: o.total_discounts,
      financial_status: o.financial_status,
      cancelled_at: o.cancelled_at,
      created_at: o.created_at,
      // Attribution : page d'arrivée (avec UTM/fbclid/gclid dans la query) +
      // référent de la session qui a créé la commande. Base de la partition
      // par canal (code influenceur > UTM payant > organique) sur /acquisition.
      landing_site: (o.landing_site || "").slice(0, 500) || null,
      referring_site: (o.referring_site || "").slice(0, 300) || null,
      source_name: o.source_name || null,
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
        // Remises exactes par ligne (comme le sync manuel) : nécessaires pour
        // valoriser les ventes influence APRÈS remise (et pour la générosité).
        discount_allocations: (li.discount_allocations || []).map((da: any) => ({
          amount: da.amount,
          discount_application_index: da.discount_application_index,
        })),
      })),
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({
        title: sl.title,
        price: sl.price,
      })),
      refunds: o.refunds,
    })

    // Mêmes formules que getAnalytics (shopify.ts) — calculées sur les commandes
    // BRUTES déjà fetchées (zéro appel API en plus).
    const analyticsOf = (raws: any[]) => {
      const total_revenue = raws.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0)
      const total_refunds = raws.reduce((s: number, o: any) =>
        s + (o.refunds || []).reduce((rs: number, r: any) =>
          rs + (r.transactions || []).reduce((ts: number, t: any) => ts + parseFloat(t.amount || "0"), 0), 0), 0)
      const total_discount = raws.reduce((s: number, o: any) => s + parseFloat(o.total_discounts || "0"), 0)
      const uniqueCustomers = new Set(raws.map((o: any) => o.customer?.id).filter(Boolean))
      return {
        total_revenue,
        total_refunds,
        total_orders: raws.length,
        aov: raws.length > 0 ? total_revenue / raws.length : 0,
        unique_customers: uniqueCustomers.size,
        total_discount,
        generosity: total_revenue > 0 ? (total_discount / total_revenue) * 100 : 0,
      }
    }

    const rawCurrent = await getAllOrders({
      created_at_min: currentStart.toISOString(),
      created_at_max: now.toISOString(),
    })
    orders = rawCurrent.map(mapOrder)
    ordersCount = orders.length

    const rawPrev = await getAllOrders({
      created_at_min: prevStart.toISOString(),
      created_at_max: currentStart.toISOString(),
    })
    prevOrders = rawPrev.map(mapOrder)

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const updatedAt = now.toISOString()
    // Upserts séparés : garder des payloads de la même taille qu'avant (1 mois ≈ 1-2 Mo)
    await supabase.from("data_cache").upsert(
      { key: `shopify_orders_${year}_${month}`, data: { orders, count: orders.length }, source: "shopify", expires_at: expiresAt, updated_at: updatedAt },
      { onConflict: "key" }
    )
    await supabase.from("data_cache").upsert(
      { key: `shopify_orders_${prevYear}_${prevMonth}`, data: { orders: prevOrders, count: prevOrders.length }, source: "shopify", expires_at: expiresAt, updated_at: updatedAt },
      { onConflict: "key" }
    )
    await supabase.from("data_cache").upsert(
      [
        { key: `shopify_analytics_${year}_${month}`, data: analyticsOf(rawCurrent), source: "shopify", expires_at: expiresAt, updated_at: updatedAt },
        { key: `shopify_analytics_${prevYear}_${prevMonth}`, data: analyticsOf(rawPrev), source: "shopify", expires_at: expiresAt, updated_at: updatedAt },
      ],
      { onConflict: "key" }
    )
    return `${orders.length} commandes (${year}-${month}) · ${prevOrders.length} (${prevYear}-${prevMonth}) · analytics ×2`
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

      // 1. Construire toutes les lignes candidates EN MÉMOIRE (zéro appel DB dans la
      //    boucle). Avant : un insert() par line item = des centaines d'allers-retours
      //    Supabase → ~100 s et timeout du cron. Maintenant : 1 SELECT + inserts en masse.
      const candidates: Record<string, unknown>[] = []
      const matchedOrderIds = new Set<string>()
      const matchedInfluencerIds = new Set<string>()
      // Mois courant + mois précédent : les commandes de la fin du mois clos
      // (après le dernier cron du mois) n'étaient jamais matchées sinon.
      for (const order of [...orders, ...prevOrders]) {
        for (const dc of order.discount_codes || []) {
          const code = (dc.code || "").toUpperCase().trim()
          const influencerId = codeMap.get(code)
          if (!influencerId) continue
          matchedOrders++
          matchedOrderIds.add(String(order.id))
          matchedInfluencerIds.add(influencerId)

          for (const item of order.line_items || []) {
            // Vente = ce que la cliente paie TTC APRÈS remise (prix catalogue −
            // discount_allocations de la ligne). Convention unique de l'influence :
            // les commissions se calculent sur le net des remises, pas le prix plein.
            const gross = parseFloat(item.price || "0") * (item.quantity || 1)
            const lineDiscount = (item.discount_allocations || []).reduce(
              (s: number, a: { amount?: string }) => s + (parseFloat(a.amount || "0") || 0), 0)
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
              line_price: Math.max(0, gross - lineDiscount),
            })
          }
        }
      }

      if (candidates.length > 0) {
        // 2. Clés déjà présentes en base, bornées aux commandes matchées (chunks pour
        //    ne pas exploser la longueur du IN). Reproduit l'unicité idx_ips_unique =
        //    (shopify_order_id, product_id, COALESCE(variant_id,'')).
        const keyOf = (r: { shopify_order_id: unknown; product_id: unknown; variant_id: unknown }) =>
          `${r.shopify_order_id}|${r.product_id}|${r.variant_id ?? ""}`
        const existing = new Set<string>()
        const orderIdList = [...matchedOrderIds]
        for (let i = 0; i < orderIdList.length; i += 200) {
          const { data: rows } = await supabase
            .from("influencer_product_sales")
            .select("shopify_order_id, product_id, variant_id")
            .in("shopify_order_id", orderIdList.slice(i, i + 200))
          for (const r of rows || []) existing.add(keyOf(r))
        }

        // 3. Filtrer doublons (déjà en base + intra-lot) puis insert en masse (paquets
        //    de 500). Pré-filtrer évite tout 23505 → pas d'échec de paquet entier.
        const seen = new Set<string>()
        const toInsert = candidates.filter((c) => {
          const k = keyOf(c as { shopify_order_id: unknown; product_id: unknown; variant_id: unknown })
          if (existing.has(k) || seen.has(k)) return false
          seen.add(k)
          return true
        })

        for (let i = 0; i < toInsert.length; i += 500) {
          const batch = toInsert.slice(i, i + 500)
          const { error } = await supabase.from("influencer_product_sales").insert(batch)
          if (!error) syncedProducts += batch.length
        }
      }

      // 4. Recalcul des totaux par influenceuse matchée (même formule canonique que
      //    /api/shopify/sync : total_sales = Σ line_price, total_orders = nb commandes
      //    distinctes). Le cron ne le faisait pas → les revenus influence du dashboard
      //    restaient figés tant qu'on ne cliquait pas un sync par source.
      for (const id of matchedInfluencerIds) {
        const { data: prodSales } = await supabase
          .from("influencer_product_sales")
          .select("line_price, shopify_order_id")
          .eq("influencer_id", id)
        if (!prodSales) continue
        const totalSales = prodSales.reduce((s, r) => s + Number(r.line_price), 0)
        const uniqueOrders = new Set(prodSales.map((r) => r.shopify_order_id)).size
        await supabase
          .from("influencers")
          .update({ total_sales: totalSales, total_orders: uniqueOrders })
          .eq("id", id)
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

  // ── 4ter. Contenu + stats Instagram (Business Discovery Meta) ──
  // Posts réels + followers/engagement de chaque @handle (tous marchés).
  await step("instagram_content", "Contenu Instagram", async () => {
    const { syncInstagramContent, instagramConfigured } = await import("@/lib/influence/instagram")
    if (!instagramConfigured()) return "ignoré (META_ACCESS_TOKEN absent)"
    const r = await syncInstagramContent()
    return `${r.profiles_ok} profils, ${r.posts_upserted} posts (${r.brand_posts} marque), ${r.profiles_failed.length} introuvables`
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

  // ── 7b. Amazon Seller (SP-API : CA + frais) + Amazon Ads (dépense) ──
  // Comme Meta/Google : le mois courant + les ~2 dernières semaines sont partiels
  // (décalage de règlement Amazon). On resync les 3 derniers mois (défaut de la
  // route) pour qu'un mois clos se verrouille sur son total réel.
  // Tant que les credentials ne sont pas posés → étape IGNORÉE (pas en erreur),
  // pour ne pas afficher un indicateur rouge permanent en attendant l'API.
  await step("amazon", "Amazon (Seller + Ads)", async () => {
    if (!isAmazonConfigured() && !isAmazonAdsConfigured()) {
      return "non configuré — ignoré (AMAZON_*_FR absents)"
    }
    const amzReq = new Request("http://internal/api/amazon/sync", { method: "POST" })
    const data = await (await syncAmazonRoute(amzReq)).json()
    const months = (data.months || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => `${m.year}-${m.month}: CA ${m.revenue ?? "?"}€ / frais ${m.fees ?? "?"}€ / ads ${m.ads ?? "?"}€`)
      .join(" · ")
    if (!data.success) {
      // 207 partiel : on remonte les erreurs sans masquer ce qui a marché
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errs = (data.months || []).flatMap((m: any) => m.errors || [])
      throw new Error(`${errs.join(" | ") || data.error || "échec sync Amazon"}${months ? ` (${months})` : ""}`)
    }
    return months || "ok"
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

  // ── 10. Analyse companion : génère les opportunités depuis les données fraîchement syncées ──
  await step("analysis_weekly", "Analyse & opportunités", async () => {
    const res = await runWeeklyAnalysis()
    const data = await res.json()
    if (!data.success && !data.skipped) throw new Error(data.error || "analyse failed")
    if (data.skipped) return "skipped (données insuffisantes)"
    const n = data.summary?.opportunities_created ?? 0
    return `${n} opportunité${n !== 1 ? "s" : ""} générée${n !== 1 ? "s" : ""}`
  })

  // ── 11. Trace finale : last_cron_sync (toujours écrit, même en échec partiel) ──
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
