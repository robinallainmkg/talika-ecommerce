import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Inspecte data_cache + le log du dernier cron pour donner, par connecteur :
// type (cache/temps réel), dernière mise à jour, période couverte, et si la data
// va bien jusqu'à hier. Toutes les données du dashboard sont CACHÉES (remplies par
// le cron 7h Paris ou un sync manuel) — aucune n'est temps réel.

interface ConnectorStatus {
  id: string
  label: string
  source: "Cache (cron 7h + sync manuel)"
  realtime: false
  last_updated: string | null
  age_hours: number | null
  latest_period: string | null // "2026-06"
  covers_through: string | null // date la plus récente réellement couverte (si connue)
  covers_yesterday: boolean | null
  status: "ok" | "warning" | "broken"
  detail: string
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

  const { data: cronRow } = await supabase
    .from("data_cache")
    .select("data")
    .eq("key", "last_cron_sync")
    .single()
  const cron = cronRow?.data as any

  const DEFS = [
    { id: "shopify_orders", label: "Shopify — Commandes", prefix: "shopify_orders_" },
    { id: "meta_ads", label: "Meta Ads", prefix: "meta_ads_" },
    { id: "google_ads", label: "Google Ads", prefix: "google_ads_" },
    { id: "klaviyo", label: "Klaviyo", prefix: "klaviyo_campaigns_" },
  ]

  const connectors: ConnectorStatus[] = []

  for (const def of DEFS) {
    let best: { y: number; m: number; key: string; updated: string | null } | null = null
    for (const row of cache) {
      const p = parsePeriod(row.key, def.prefix)
      if (!p) continue
      if (!best || p.y * 100 + p.m > best.y * 100 + best.m) {
        best = { ...p, key: row.key, updated: row.updated_at }
      }
    }

    const base: ConnectorStatus = {
      id: def.id,
      label: def.label,
      source: "Cache (cron 7h + sync manuel)",
      realtime: false,
      last_updated: null,
      age_hours: null,
      latest_period: null,
      covers_through: null,
      covers_yesterday: null,
      status: "broken",
      detail: "Aucune donnée en cache",
    }

    if (!best) {
      connectors.push(base)
      continue
    }

    const monthsBehind = (curY - best.y) * 12 + (curM - best.m)
    const ageHours = best.updated
      ? Math.round((now.getTime() - new Date(best.updated).getTime()) / 3600000)
      : null
    const latestPeriod = `${best.y}-${String(best.m).padStart(2, "0")}`

    // Couverture fine pour les commandes Shopify : date max de commande du mois courant
    let coversThrough: string | null = null
    if (def.id === "shopify_orders" && monthsBehind <= 0) {
      const { data: orderRow } = await supabase
        .from("data_cache")
        .select("data")
        .eq("key", best.key)
        .single()
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
      detail = `🔴 Bloqué sur ${latestPeriod} — ${monthsBehind} mois de retard. Le sync échoue.`
    } else if (coversThrough && coversThrough < yesterday) {
      status = "warning"
      detail = `Mois en cours présent mais la dernière donnée date du ${coversThrough} (pas jusqu'à hier ${yesterday}).`
    } else if (ageHours !== null && ageHours > 48) {
      status = "warning"
      detail = `Mois en cours présent mais pas rafraîchi depuis ${ageHours}h.`
    }

    connectors.push({
      ...base,
      last_updated: best.updated,
      age_hours: ageHours,
      latest_period: latestPeriod,
      covers_through: coversThrough,
      covers_yesterday: coversThrough ? coversThrough >= yesterday : monthsBehind <= 0 ? null : false,
      status,
      detail,
    })
  }

  // Statut du dernier cron + par étape (depuis le log)
  const log: string[] = Array.isArray(cron?.log) ? cron.log : []
  const frenchify = (l: string): string => {
    let m: RegExpMatchArray | null
    if ((m = l.match(/Cached (\d+) orders for (\S+)/))) return `Commandes Shopify : ${m[1]} enregistrées (${m[2]})`
    if ((m = l.match(/Cached (\d+) discount codes/))) return `Codes promo : ${m[1]} récupérés`
    if ((m = l.match(/Auto-classified (\d+)/))) return `${m[1]} codes auto-classés (remises automatiques)`
    if ((m = l.match(/Influencer sales: (\d+) matched orders, (\d+) new products/)))
      return `Ventes influenceurs : ${m[1]} commandes, ${m[2]} produits`
    if (/Objectives updated/.test(l)) return "Objectifs : mis à jour ✓"
    if (/Objectives sync/.test(l)) return "Objectifs : échec du sync"
    if (/Klaviyo synced/.test(l)) return "Klaviyo : synchronisé ✓"
    if (/Klaviyo sync/.test(l)) return "Klaviyo : échec du sync"
    if (/Google Ads synced/.test(l)) return "Google Ads : synchronisé ✓"
    if (/Google Ads sync/.test(l)) return "Google Ads : échec (Python indisponible sur Vercel — à réécrire en Node)"
    if (/Meta Ads synced/.test(l)) return "Meta Ads : synchronisé ✓"
    if (/Meta Ads sync/.test(l)) return "Meta Ads : échec du sync"
    return l
  }
  const steps = log
    .filter((l) => /skipped|cached|matched|error|not valid|synced|updated/i.test(l))
    .map((l) => ({ line: frenchify(l), failed: /skipped|error|not valid/i.test(l) }))
  const cronRanAt = cron?.ran_at || null
  const cronAge = cronRanAt
    ? Math.round((now.getTime() - new Date(cronRanAt).getTime()) / 3600000)
    : null
  const failedCount = steps.filter((s) => s.failed).length

  return NextResponse.json({
    generated_at: now.toISOString(),
    yesterday,
    cron: {
      ran_at: cronRanAt,
      age_hours: cronAge,
      orders_count: cron?.orders_count ?? null,
      failed_count: failedCount,
      steps,
    },
    connectors,
  })
}
