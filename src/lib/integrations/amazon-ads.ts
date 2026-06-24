/**
 * Amazon Ads API — intégration Node / REST (séparée de SP-API : autre app LWA,
 * autre endpoint, scope = profil annonceur).
 *
 * Périmètre : Talika **Europe**. On AUTO-DÉCOUVRE les profils annonceur via
 * `GET /v2/profiles` (un profil par pays/marketplace) et on somme la dépense
 * mensuelle de tous, avec détail par pays + total EUR (conversion BCE pour les
 * profils non-euro : UK=GBP, SE=SEK, PL=PLN…).
 * `AMAZON_ADS_PROFILE_ID_FR` (optionnel) restreint à un/des profil(s) précis
 * (liste séparée par virgules) si on veut limiter le périmètre.
 *
 * Méthode : Reporting API v3 (asynchrone) — POST /reporting/reports → polling
 * COMPLETED → download GZIP_JSON → somme de `cost`. On agrège Sponsored Products
 * + Brands + Display ; un type absent d'un compte échoue proprement.
 *
 * Auth : LWA refresh token (app Amazon Ads). Endpoint EU.
 */
import { gunzipSync } from "zlib"
import { eurPerUnit } from "./fx"

const CLIENT_ID = process.env.AMAZON_ADS_CLIENT_ID_FR || ""
const CLIENT_SECRET = process.env.AMAZON_ADS_CLIENT_SECRET_FR || ""
const REFRESH_TOKEN = process.env.AMAZON_ADS_REFRESH_TOKEN_FR || ""
// Optionnel : restreindre à un/des profileId (liste CSV). Vide = tous les profils EU.
const PROFILE_FILTER = (process.env.AMAZON_ADS_PROFILE_ID_FR || "")
  .split(",").map((s) => s.trim()).filter(Boolean)
const ADS_HOST = process.env.AMAZON_ADS_ENDPOINT || "https://advertising-api-eu.amazon.com"
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"

/** true si les credentials Amazon Ads sont présents (le profil est auto-découvert). */
export function isAmazonAdsConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number =>
  v == null ? 0 : typeof v === "string" ? parseFloat(v) || 0 : typeof v === "number" ? v : 0

let _token: { value: string; exp: number } | null = null
async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.exp) return _token.value
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`LWA Ads: ${data.error || res.status} ${data.error_description || ""}`.trim())
  }
  _token = { value: data.access_token, exp: Date.now() + 50 * 60 * 1000 }
  return data.access_token
}

function adsHeaders(token: string, profileId?: string | number): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Amazon-Advertising-API-ClientId": CLIENT_ID,
    "Content-Type": "application/json",
  }
  if (profileId != null) h["Amazon-Advertising-API-Scope"] = String(profileId)
  return h
}

export interface AdsProfile { profileId: string; countryCode: string; currencyCode: string; name: string }

// Découvre les profils annonceur (un par pays). Filtre optionnel par PROFILE_FILTER.
async function getProfiles(): Promise<AdsProfile[]> {
  const token = await getAccessToken()
  const res = await fetch(`${ADS_HOST}/v2/profiles`, { headers: adsHeaders(token) })
  if (!res.ok) throw new Error(`Ads /v2/profiles ${res.status}: ${(await res.text()).slice(0, 200)}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = await res.json()
  let profiles = (list || []).map((p) => ({
    profileId: String(p.profileId),
    countryCode: p.countryCode || "??",
    currencyCode: p.currencyCode || "EUR",
    name: p.accountInfo?.name || p.accountInfo?.type || p.countryCode || "?",
  }))
  if (PROFILE_FILTER.length) profiles = profiles.filter((p) => PROFILE_FILTER.includes(p.profileId))
  return profiles
}

interface ReportTypeDef { key: "sp" | "sb" | "sd"; adProduct: string; reportTypeId: string }
const REPORT_TYPES: ReportTypeDef[] = [
  { key: "sp", adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spCampaigns" },
  { key: "sb", adProduct: "SPONSORED_BRANDS", reportTypeId: "sbCampaigns" },
  { key: "sd", adProduct: "SPONSORED_DISPLAY", reportTypeId: "sdCampaigns" },
]

async function createReport(profileId: string, t: ReportTypeDef, startDate: string, endDate: string): Promise<string> {
  const token = await getAccessToken()
  const res = await fetch(`${ADS_HOST}/reporting/reports`, {
    method: "POST",
    headers: adsHeaders(token, profileId),
    body: JSON.stringify({
      name: `talika-${profileId}-${t.key}-${startDate}`,
      startDate,
      endDate,
      configuration: {
        adProduct: t.adProduct,
        groupBy: ["campaign"],
        columns: ["cost", "campaignName"],
        reportTypeId: t.reportTypeId,
        timeUnit: "SUMMARY",
        format: "GZIP_JSON",
      },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.reportId) {
    throw new Error(`createReport ${t.key} p${profileId} ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.reportId
}

async function waitForReport(profileId: string, reportId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const token = await getAccessToken()
    const res = await fetch(`${ADS_HOST}/reporting/reports/${reportId}`, { headers: adsHeaders(token, profileId) })
    const data = await res.json().catch(() => ({}))
    if (data.status === "COMPLETED" && data.url) return data.url
    if (data.status === "FAILED" || data.status === "CANCELLED") {
      throw new Error(`report ${reportId} ${data.status}: ${data.failureReason || ""}`)
    }
    await sleep(8000)
  }
  throw new Error(`report ${reportId}: timeout`)
}

async function downloadCost(url: string): Promise<number> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const json = JSON.parse(gunzipSync(buf).toString("utf8"))
  const rows = Array.isArray(json) ? json : json?.rows || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.reduce((s: number, row: any) => s + num(row.cost), 0)
}

export interface AmazonAdsCountryLine {
  countryCode: string
  currency: string
  spend_native: number
  spend_eur: number
}
export interface AmazonAdsSpend {
  year: number
  month: number
  spend: number // total EUR (canonique, lu par le P&L)
  currency: "EUR"
  partial: boolean
  by_country: AmazonAdsCountryLine[]
  fx_missing: string[]
  fetched_at: string
}

/** Dépense Amazon Ads d'un mois civil, tous profils EU, consolidée en EUR. */
export async function getAmazonAdsSpend(year: number, month: number): Promise<AmazonAdsSpend> {
  const pad = (n: number) => String(n).padStart(2, "0")
  const now = new Date()
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1
  const lastDay = isCurrent ? now.getDate() : new Date(year, month, 0).getDate()
  const startDate = `${year}-${pad(month)}-01`
  const endDate = `${year}-${pad(month)}-${pad(lastDay)}`

  const profiles = await getProfiles()

  // 1. Créer tous les rapports (profil × type) en parallèle → ils se génèrent côté Amazon.
  const jobs: Array<{ profile: AdsProfile; reportId: string }> = []
  await Promise.allSettled(
    profiles.flatMap((profile) =>
      REPORT_TYPES.map(async (t) => {
        const reportId = await createReport(profile.profileId, t, startDate, endDate)
        jobs.push({ profile, reportId })
      })
    )
  )

  // 2. Poll + download en parallèle ; somme par profil (devise native).
  const native = new Map<string, { profile: AdsProfile; spend: number }>()
  await Promise.allSettled(
    jobs.map(async ({ profile, reportId }) => {
      const url = await waitForReport(profile.profileId, reportId)
      const cost = await downloadCost(url)
      const cur = native.get(profile.profileId) || { profile, spend: 0 }
      cur.spend += cost
      native.set(profile.profileId, cur)
    })
  )

  // 3. Conversion EUR (taux BCE fin de mois).
  const fxDate = `${year}-${pad(month)}-${pad(lastDay)}`
  const rates = await eurPerUnit(fxDate, [...native.values()].map((n) => n.profile.currencyCode))
  const fxMissing = new Set<string>()
  let totalEur = 0
  const by_country: AmazonAdsCountryLine[] = []
  for (const { profile, spend } of native.values()) {
    const k = rates[profile.currencyCode]
    if (k == null) { fxMissing.add(profile.currencyCode); continue }
    totalEur += spend * k
    by_country.push({
      countryCode: profile.countryCode,
      currency: profile.currencyCode,
      spend_native: r2(spend),
      spend_eur: r2(spend * k),
    })
  }
  by_country.sort((a, z) => z.spend_eur - a.spend_eur)

  return {
    year,
    month,
    spend: r2(totalEur),
    currency: "EUR",
    partial: isCurrent,
    by_country,
    fx_missing: [...fxMissing],
    fetched_at: new Date().toISOString(),
  }
}
