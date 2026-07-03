import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAmazonFinancials, isAmazonConfigured } from "@/lib/integrations/amazon"
import { getAmazonAdsSpend, isAmazonAdsConfigured } from "@/lib/integrations/amazon-ads"

export const dynamic = "force-dynamic"
// Next 14 met en cache les GET fetch (dont supabase-js) dans le Data Cache Vercel
// -> lectures perimees (incident 03/07 : triple envoi, compteur a 0). Jamais de cache ici.
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 min (Vercel Pro) — financialEvents pagine lentement (0.5 req/s)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const pad = (n: number) => String(n).padStart(2, "0")
// Clés data_cache scopées (convention CIBLE, CLAUDE.md §7) : <marché>:<canal>:<type>:<période>
const revKey = (y: number, m: number) => `fr:amazon:revenue:${y}-${pad(m)}`
const feesKey = (y: number, m: number) => `fr:amazon:fees:${y}-${pad(m)}`
const adsKey = (y: number, m: number) => `fr:amazon:ads:${y}-${pad(m)}`

interface Target { year: number; month: number }

// Parse "YYYY-MM" → {year, month} (null si invalide).
function parseYM(s: string): Target | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) }
}

// Liste des mois à synchroniser depuis le body :
//  - { year, month }            → un mois précis
//  - { from:"YYYY-MM", to:"…" } → plage inclusive (backfill / réconciliation)
//  - défaut                     → mois courant + 2 précédents (verrouille les mois clos)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveTargets(body: any): Target[] {
  if (body?.year && body?.month) return [{ year: body.year, month: body.month }]
  if (body?.from && body?.to) {
    const a = parseYM(String(body.from))
    const b = parseYM(String(body.to))
    if (a && b) {
      const out: Target[] = []
      const cur = new Date(Date.UTC(a.year, a.month - 1, 1))
      const end = new Date(Date.UTC(b.year, b.month - 1, 1))
      while (cur <= end && out.length < 24) {
        out.push({ year: cur.getUTCFullYear(), month: cur.getUTCMonth() + 1 })
        cur.setUTCMonth(cur.getUTCMonth() + 1)
      }
      return out
    }
  }
  const now = new Date()
  const out: Target[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return out
}

export async function POST(request: Request) {
  try {
    const spOk = isAmazonConfigured()
    const adsOk = isAmazonAdsConfigured()
    if (!spOk && !adsOk) {
      return NextResponse.json(
        { error: "Amazon credentials non configurés (AMAZON_SPAPI_*_FR / AMAZON_ADS_*_FR)" },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const targets = resolveTargets(body)
    const now = new Date().toISOString()
    const ttl = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const results: Array<{
      year: number; month: number
      revenue?: number; fees?: number; ads?: number; partial?: boolean
      marketplaces?: number; ads_countries?: number; fx_missing?: string[]
      errors?: string[]
    }> = []

    for (const { year, month } of targets) {
      const r: (typeof results)[number] = { year, month, errors: [] }
      const fxMissing = new Set<string>()

      // SP-API : CA + frais (toutes marketplaces EU, consolidé EUR)
      if (spOk) {
        try {
          const fin = await getAmazonFinancials(year, month)
          r.revenue = fin.revenue.revenue
          r.fees = fin.fees.total
          r.partial = fin.partial
          r.marketplaces = fin.revenue.by_marketplace.length
          fin.revenue.fx_missing.forEach((c) => fxMissing.add(c))
          await supabase.from("data_cache").upsert(
            { key: revKey(year, month), data: fin.revenue, source: "amazon", expires_at: ttl, updated_at: now },
            { onConflict: "key" }
          )
          await supabase.from("data_cache").upsert(
            { key: feesKey(year, month), data: fin.fees, source: "amazon", expires_at: ttl, updated_at: now },
            { onConflict: "key" }
          )
        } catch (e) {
          r.errors!.push(`spapi: ${e instanceof Error ? e.message : e}`)
        }
      }

      // Amazon Ads : dépense (tous profils EU, consolidé EUR)
      if (adsOk) {
        try {
          const ads = await getAmazonAdsSpend(year, month)
          r.ads = ads.spend
          r.ads_countries = ads.by_country.length
          ads.fx_missing.forEach((c) => fxMissing.add(c))
          await supabase.from("data_cache").upsert(
            { key: adsKey(year, month), data: ads, source: "amazon_ads", expires_at: ttl, updated_at: now },
            { onConflict: "key" }
          )
        } catch (e) {
          r.errors!.push(`ads: ${e instanceof Error ? e.message : e}`)
        }
      }

      if (fxMissing.size) r.fx_missing = [...fxMissing]
      if (r.errors!.length === 0) delete r.errors
      results.push(r)
    }

    const hadError = results.some((r) => r.errors && r.errors.length)
    return NextResponse.json({ success: !hadError, months: results }, { status: hadError ? 207 : 200 })
  } catch (error) {
    console.error("Amazon sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Amazon sync failed" },
      { status: 500 }
    )
  }
}

// GET : renvoie le mois courant depuis le cache (lecture rapide).
export async function GET() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const { data } = await supabase
    .from("data_cache")
    .select("key, data")
    .in("key", [revKey(y, m), feesKey(y, m), adsKey(y, m)])

  const out: Record<string, unknown> = { revenue: null, fees: null, ads: null }
  for (const row of data || []) {
    if (row.key === revKey(y, m)) out.revenue = row.data
    else if (row.key === feesKey(y, m)) out.fees = row.data
    else if (row.key === adsKey(y, m)) out.ads = row.data
  }
  return NextResponse.json(out)
}
