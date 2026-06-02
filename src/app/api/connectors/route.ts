import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface ConnectorStatus {
  id: string
  label: string
  source: string
  last_updated: string | null
  age_hours: number | null
  latest_period: string | null
  covers_through: string | null
  status: "ok" | "warning" | "broken"
  detail: string
  doc: {
    refresh_prompt: string
    how_to_refresh: string
    token_info?: string
  }
  counts?: Record<string, number>
}

function parsePeriod(key: string, prefix: string): { y: number; m: number } | null {
  if (!key.startsWith(prefix)) return null
  const m = key.slice(prefix.length).match(/^(\d{4})_(\d{1,2})$/)
  return m ? { y: parseInt(m[1]), m: parseInt(m[2]) } : null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export async function GET() {
  const now = new Date()
  const curY = now.getUTCFullYear()
  const curM = now.getUTCMonth() + 1
  const yesterday = ymd(new Date(now.getTime() - 24 * 3600 * 1000))

  const { data: rows } = await supabase.from("data_cache").select("key, source, updated_at")
  const cache = rows || []

  const connectors: ConnectorStatus[] = []

  // ── Helper for cache-based connectors ──
  const CACHE_DEFS = [
    {
      id: "shopify_orders",
      label: "Shopify — Commandes",
      prefix: "shopify_orders_",
      doc: {
        refresh_prompt: "Synchronise les commandes Shopify du mois en cours",
        how_to_refresh: "POST /api/shopify/sync ou bouton ci-dessous. Aussi lancé par le cron 7h.",
        token_info: "SHOPIFY_ACCESS_TOKEN — token permanent (custom app), pas d'expiration.",
      },
    },
    {
      id: "meta_ads",
      label: "Meta Ads",
      prefix: "meta_ads_",
      doc: {
        refresh_prompt: "Synchronise les données Meta Ads du mois en cours",
        how_to_refresh: "POST /api/meta/sync ou bouton ci-dessous. Aussi lancé par le cron 7h.",
        token_info: "META_ACCESS_TOKEN — token System User permanent, ne meurt jamais.",
      },
    },
    {
      id: "google_ads",
      label: "Google Ads",
      prefix: "google_ads_",
      doc: {
        refresh_prompt: "Synchronise les données Google Ads du mois en cours",
        how_to_refresh: "POST /api/google/sync ou bouton ci-dessous. Aussi lancé par le cron 7h.",
        token_info: "GOOGLE_ADS_REFRESH_TOKEN — durable (OAuth publié en Production). Si invalid_grant → voir §13 du CLAUDE.md pour régénérer.",
      },
    },
  ]

  for (const def of CACHE_DEFS) {
    let best: { y: number; m: number; key: string; updated: string | null } | null = null
    for (const row of cache) {
      const p = parsePeriod(row.key, def.prefix)
      if (!p) continue
      if (!best || p.y * 100 + p.m > best.y * 100 + best.m) {
        best = { ...p, key: row.key, updated: row.updated_at }
      }
    }

    if (!best) {
      connectors.push({
        id: def.id, label: def.label, source: "Cache (cron 7h + sync manuel)",
        last_updated: null, age_hours: null, latest_period: null, covers_through: null,
        status: "broken", detail: "Aucune donnée en cache", doc: def.doc,
      })
      continue
    }

    const monthsBehind = (curY - best.y) * 12 + (curM - best.m)
    const ageHours = best.updated
      ? Math.round((now.getTime() - new Date(best.updated).getTime()) / 3600000)
      : null
    const latestPeriod = `${best.y}-${String(best.m).padStart(2, "0")}`

    let coversThrough: string | null = null
    if (def.id === "shopify_orders" && monthsBehind <= 0) {
      const { data: orderRow } = await supabase
        .from("data_cache").select("data").eq("key", best.key).single()
      const orders = (orderRow?.data as any)?.orders || []
      let max = ""
      for (const o of orders) {
        const d = (o.created_at || "").slice(0, 10)
        if (d > max) max = d
      }
      coversThrough = max || null
    }

    let status: ConnectorStatus["status"] = "ok"
    let detail = `À jour — mois en cours (${latestPeriod})`
    if (monthsBehind >= 1) {
      status = "broken"
      detail = `Bloqué sur ${latestPeriod} — ${monthsBehind} mois de retard.`
    } else if (coversThrough && coversThrough < yesterday) {
      status = "warning"
      detail = `Dernière donnée : ${coversThrough} (pas jusqu'à hier).`
    } else if (ageHours !== null && ageHours > 48) {
      status = "warning"
      detail = `Pas rafraîchi depuis ${ageHours}h.`
    }

    connectors.push({
      id: def.id, label: def.label, source: "Cache (cron 7h + sync manuel)",
      last_updated: best.updated, age_hours: ageHours, latest_period: latestPeriod,
      covers_through: coversThrough, status, detail, doc: def.doc,
    })
  }

  // ── Klaviyo ──
  {
    const { data: kRow } = await supabase
      .from("data_cache").select("data, updated_at").eq("key", "klaviyo_campaigns").single()
    const fetchedAt = (kRow?.data as any)?.fetched_at || kRow?.updated_at || null
    const ageH = fetchedAt
      ? Math.round((now.getTime() - new Date(fetchedAt).getTime()) / 3600000) : null
    connectors.push({
      id: "klaviyo", label: "Klaviyo", source: "Cache (cron 7h + sync manuel)",
      last_updated: fetchedAt, age_hours: ageH,
      latest_period: fetchedAt ? fetchedAt.slice(0, 10) : null, covers_through: null,
      status: ageH === null ? "broken" : ageH > 48 ? "warning" : "ok",
      detail: ageH === null ? "Jamais synchronisé" : ageH > 48 ? `Pas rafraîchi depuis ${ageH}h.` : "À jour (campagnes, flows, listes).",
      doc: {
        refresh_prompt: "Synchronise les campagnes, flows et listes Klaviyo",
        how_to_refresh: "POST /api/klaviyo/sync ou bouton ci-dessous. Aussi lancé par le cron 7h.",
        token_info: "KLAVIYO_API_KEY — clé API privée, pas d'expiration.",
      },
    })
  }

  // ── Influenceurs (données Supabase, pas de cache) ──
  {
    const [
      { count: codesCount },
      { count: feesCount },
      { count: commissionsCount },
      { count: salesCount },
      { count: influencersCount },
    ] = await Promise.all([
      supabase.from("influencer_codes").select("*", { count: "exact", head: true }),
      supabase.from("influencer_fixed_fees").select("*", { count: "exact", head: true }),
      supabase.from("influencer_commissions").select("*", { count: "exact", head: true }),
      supabase.from("influencer_product_sales").select("*", { count: "exact", head: true }),
      supabase.from("influencers").select("*", { count: "exact", head: true }),
    ])

    const hasData = (influencersCount || 0) > 0
    connectors.push({
      id: "influencers", label: "Influenceurs", source: "Supabase (saisie manuelle + cron)",
      last_updated: null, age_hours: null, latest_period: null, covers_through: null,
      status: hasData ? "ok" : "broken",
      detail: hasData
        ? `${influencersCount} influenceurs, ${codesCount} codes, ${feesCount} fees, ${commissionsCount} commissions, ${salesCount} ventes produits`
        : "Aucun influenceur enregistré.",
      doc: {
        refresh_prompt: "Importe les fixed fees et commissions influenceurs depuis un fichier Excel. Voici le fichier : [joindre le fichier]. Colonnes attendues : influenceur, mois, année, montant, type (fee/commission).",
        how_to_refresh: "Donne un fichier Excel à Claude Code avec les fees/commissions. Les ventes produits sont calculées automatiquement par le cron (matching codes promo × commandes Shopify).",
      },
      counts: {
        influenceurs: influencersCount || 0,
        codes: codesCount || 0,
        fees: feesCount || 0,
        commissions: commissionsCount || 0,
        ventes_produits: salesCount || 0,
      },
    })
  }

  // ── Objectifs 2026 ──
  {
    const { data: objData } = await supabase
      .from("objectives_2026").select("month, ca_2026, generosite, updated_at")
      .order("month")
    const filled = (objData || []).filter(o => o.ca_2026 !== null || o.generosite !== null)
    const lastUpdated = (objData || [])
      .map(o => o.updated_at).filter(Boolean).sort().pop() || null
    const ageH = lastUpdated
      ? Math.round((now.getTime() - new Date(lastUpdated).getTime()) / 3600000) : null

    connectors.push({
      id: "objectives", label: "Objectifs 2026", source: "Supabase (saisie manuelle + sync)",
      last_updated: lastUpdated, age_hours: ageH, latest_period: null, covers_through: null,
      status: filled.length >= curM ? "ok" : filled.length > 0 ? "warning" : "broken",
      detail: `${filled.length}/12 mois renseignés. Générosité sync = POST /api/objectives/sync.`,
      doc: {
        refresh_prompt: "Mets à jour les objectifs 2026 depuis le Reporting Global Excel ci-joint. Colonnes à remplir : ca_2025, ca_2026, media_spent par mois. La générosité est calculée automatiquement depuis Shopify.",
        how_to_refresh: "Bouton Sync = met à jour la générosité (auto, depuis Shopify). Pour ca_2025, ca_2026, media_spent → donne le Reporting Global Excel à Claude Code.",
      },
      counts: { mois_renseignes: filled.length },
    })
  }

  // ── Calendrier ──
  {
    const { count: eventsCount } = await supabase
      .from("calendar_events").select("*", { count: "exact", head: true })
    const { data: nextEvent } = await supabase
      .from("calendar_events").select("title, scheduled_at")
      .gte("scheduled_at", now.toISOString()).order("scheduled_at").limit(1).single()

    connectors.push({
      id: "calendar", label: "Calendrier", source: "Supabase (saisie manuelle)",
      last_updated: null, age_hours: null, latest_period: null, covers_through: null,
      status: (eventsCount || 0) > 0 ? "ok" : "warning",
      detail: nextEvent
        ? `${eventsCount} événements. Prochain : ${nextEvent.title} (${new Date(nextEvent.scheduled_at).toLocaleDateString("fr-FR")})`
        : `${eventsCount || 0} événements.`,
      doc: {
        refresh_prompt: "Synchronise le calendrier marketing depuis le planning Canva (DAG7BX1zTgs) vers Supabase calendar_events",
        how_to_refresh: "POST /api/calendar/sync (sans body = planning 2026 intégré). Pour mettre à jour depuis le Canva, demande à Claude Code de lire le Canva et sync.",
      },
      counts: { evenements: eventsCount || 0 },
    })
  }

  // ── Cron info (discret) ──
  const { data: cronRow } = await supabase
    .from("data_cache").select("data").eq("key", "last_cron_sync").single()
  const cron = cronRow?.data as any
  const cronRanAt = cron?.ran_at || null
  const cronAge = cronRanAt
    ? Math.round((now.getTime() - new Date(cronRanAt).getTime()) / 3600000) : null

  return NextResponse.json({
    generated_at: now.toISOString(),
    yesterday,
    cron: { ran_at: cronRanAt, age_hours: cronAge },
    connectors,
  })
}
