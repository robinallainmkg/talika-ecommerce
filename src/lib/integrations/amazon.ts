/**
 * Amazon Seller Central (SP-API) — intégration Node / REST.
 *
 * Périmètre : Talika **Europe** (compte Seller unifié EU). UNE autorisation SP-API
 * sur l'endpoint EU couvre TOUTES les marketplaces du compte (DE, FR, IT, ES, NL,
 * SE, PL, BE, IE, UK + MENA SA/AE/EG). On lit les **Financial Events** (Finances
 * API v0) et on agrège par mois civil :
 *   - CA net (Principal des expéditions − remboursements, promos incluses)
 *   - Frais Amazon : referral (Commission) + FBA + stockage (ServiceFee) + autres
 *   - **Détail par marketplace/pays** + total Europe consolidé en EUR.
 *
 * Multi-devises : chaque marketplace facture dans SA devise (UK=GBP, SE=SEK,
 * PL=PLN, le reste EUR). On garde le natif par pays ET on convertit en EUR (taux
 * BCE fin de mois, cf ./fx) pour la ligne consolidée. Devise non résolue → flaggée
 * dans `fx_missing` (jamais sommée à tort).
 *
 * Auth : LWA (Login With Amazon) refresh token — PAS d'AWS SigV4 (seul le header
 * `x-amz-access-token` est requis). Voir CLAUDE.md §15 pour régénérer le token.
 *
 * ⚠️ Décalage de règlement (~2 sem.) : le mois courant et les ~2 dernières semaines
 * sont PARTIELS → on resynchronise les mois récents à chaque run (cf. run-all.ts).
 *
 * ⚠️ Définition du CA "Ventes Amazon" PROVISOIRE : on stocke plusieurs candidats
 * (principal net, + shipping, + tax…) pour réconcilier avec l'Excel Reporting
 * Global AVANT de figer la formule canonique `revenue`.
 */
import { eurPerUnit } from "./fx"

// ── Config (env scopées EU, cf CLAUDE.md §7) ──
const CLIENT_ID = process.env.AMAZON_SPAPI_CLIENT_ID_FR || ""
const CLIENT_SECRET = process.env.AMAZON_SPAPI_CLIENT_SECRET_FR || ""
const REFRESH_TOKEN = process.env.AMAZON_SPAPI_REFRESH_TOKEN_FR || ""
// Endpoint régional EU (couvre tout le compte Seller européen).
const SPAPI_HOST = process.env.AMAZON_SPAPI_ENDPOINT || "https://sellingpartnerapi-eu.amazon.com"
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"

/** true si les credentials SP-API sont présents (sinon on no-op proprement). */
export function isAmazonConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (v: unknown): number =>
  v == null ? 0 : typeof v === "string" ? parseFloat(v) || 0 : typeof v === "number" ? v : 0
const r2 = (n: number) => Math.round(n * 100) / 100

// ── LWA : échange refresh_token → access_token ──
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
    throw new Error(`LWA SP-API: ${data.error || res.status} ${data.error_description || ""}`.trim())
  }
  _token = { value: data.access_token, exp: Date.now() + 50 * 60 * 1000 }
  return data.access_token
}

// ── GET signé LWA, avec retry sur throttle (429) / 5xx ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function spGet(path: string, query: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(query).toString()
  const url = `${SPAPI_HOST}${path}?${qs}`
  let lastErr = ""
  for (let attempt = 0; attempt < 6; attempt++) {
    const token = await getAccessToken()
    const res = await fetch(url, { headers: { "x-amz-access-token": token, Accept: "application/json" } })
    if (res.ok) return res.json()
    const body = await res.text()
    lastErr = `SP-API ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 300)}`
    // 429 = throttle (listFinancialEvents = 0.5 req/s) ; 5xx = transitoire → backoff.
    if (res.status !== 429 && res.status < 500) throw new Error(lastErr)
    await sleep(2000 * (attempt + 1))
  }
  throw new Error(`SP-API: épuisé après retries — ${lastErr}`)
}

// ── Accumulateurs (par marketplace, en devise NATIVE) ──
interface RevAcc {
  principal_gross: number
  principal_net: number
  promo: number
  shipping: number
  tax: number
  refunds_principal: number
}
interface FeeAcc { total: number; referral: number; fba: number; storage: number; other: number }
interface Bucket { currency: string; rev: RevAcc; fee: FeeAcc; orders: number }

const newRev = (): RevAcc => ({ principal_gross: 0, principal_net: 0, promo: 0, shipping: 0, tax: 0, refunds_principal: 0 })
const newFee = (): FeeAcc => ({ total: 0, referral: 0, fba: 0, storage: 0, other: 0 })

function getBucket(map: Map<string, Bucket>, name: string): Bucket {
  let b = map.get(name)
  if (!b) { b = { currency: "EUR", rev: newRev(), fee: newFee(), orders: 0 }; map.set(name, b) }
  return b
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addCharges(b: Bucket, list: any[] | undefined, sign: 1 | -1) {
  for (const c of list || []) {
    const t = (c.ChargeType || "").toString()
    if (c.ChargeAmount?.CurrencyCode) b.currency = c.ChargeAmount.CurrencyCode
    const amt = num(c.ChargeAmount?.CurrencyAmount) * sign
    if (t === "Principal") {
      b.rev.principal_net += amt
      if (sign === 1) b.rev.principal_gross += amt
      else b.rev.refunds_principal += amt
    } else if (t.includes("Shipping") && !t.includes("Tax")) {
      b.rev.shipping += amt
    } else if (t.includes("Tax")) {
      b.rev.tax += amt
    } else if (t === "GiftWrap") {
      b.rev.shipping += amt
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addPromos(b: Bucket, list: any[] | undefined) {
  for (const p of list || []) b.rev.promo += num(p.PromotionAmount?.CurrencyAmount)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addFees(b: Bucket, list: any[] | undefined, sign: 1 | -1, reason = "") {
  for (const f of list || []) {
    const t = (f.FeeType || "").toString()
    if (f.FeeAmount?.CurrencyCode) b.currency = f.FeeAmount.CurrencyCode
    const v = Math.abs(num(f.FeeAmount?.CurrencyAmount)) * sign
    if (t === "Commission" || /referral/i.test(t)) b.fee.referral += v
    else if (/^FBA/i.test(t) || /fulfillment/i.test(t)) b.fee.fba += v
    else if (/storage/i.test(reason) || /storage/i.test(t)) b.fee.storage += v
    else b.fee.other += v
    b.fee.total += v
  }
}

// ── Pagination listFinancialEvents sur une plage [postedAfter, postedBefore) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listFinancialEvents(postedAfter: string, postedBefore: string): Promise<any> {
  const merged: Record<string, unknown[]> = {}
  let nextToken: string | undefined
  let pages = 0
  do {
    const query: Record<string, string> = nextToken
      ? { NextToken: nextToken }
      : { PostedAfter: postedAfter, PostedBefore: postedBefore, MaxResultsPerPage: "100" }
    const data = await spGet("/finances/v0/financialEvents", query)
    const fe = data?.payload?.FinancialEvents || {}
    for (const [k, v] of Object.entries(fe)) {
      if (Array.isArray(v)) merged[k] = [...(merged[k] || []), ...v]
    }
    nextToken = data?.payload?.NextToken
    pages++
    if (nextToken) await sleep(1200) // respecte ~0.5 req/s
  } while (nextToken && pages < 80)
  return merged
}

// ── Types de sortie ──
export interface AmazonMarketplaceLine {
  marketplace: string // "Amazon.de", "Amazon.it"…
  currency: string // devise native
  revenue_native: number // principal net + promo (natif)
  fees_native: number
  revenue_eur: number // converti BCE
  fees_eur: number
  orders: number
}

export interface AmazonRevenue {
  /** CA EUR consolidé (provisoire) = principal net + promo. Lu par le P&L. */
  revenue: number
  currency: "EUR"
  principal_gross: number
  principal_net: number
  promo: number
  shipping: number
  tax: number
  refunds_principal: number
  gross_sales: number
  orders: number
  events: number
  by_marketplace: AmazonMarketplaceLine[]
  fx_missing: string[] // devises non converties (exclues du total EUR) — à surveiller
}

export interface AmazonFees {
  total: number
  referral: number
  fba: number
  storage: number
  other: number
  currency: "EUR"
}

export interface AmazonFinancials {
  year: number
  month: number
  partial: boolean
  revenue: AmazonRevenue
  fees: AmazonFees
  fetched_at: string
}

/** Agrège les financial events d'UN mois civil (toutes marketplaces EU). */
export async function getAmazonFinancials(year: number, month: number): Promise<AmazonFinancials> {
  const pad = (n: number) => String(n).padStart(2, "0")
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1)) // exclusif
  const now = new Date()
  const postedBefore = end > now ? now : end
  const partial = end > now || now.getTime() - end.getTime() < 14 * 24 * 60 * 60 * 1000

  const fe = await listFinancialEvents(start.toISOString(), postedBefore.toISOString())
  const buckets = new Map<string, Bucket>()
  let events = 0

  // 1. Expéditions (ventes), bucketisées par marketplace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of (fe.ShipmentEventList as any[]) || []) {
    const b = getBucket(buckets, ev.MarketplaceName || "Inconnu")
    b.orders++
    events++
    for (const item of ev.ShipmentItemList || []) {
      addCharges(b, item.ItemChargeList, 1)
      addPromos(b, item.PromotionList)
      addFees(b, item.ItemFeeList, 1)
    }
    addFees(b, ev.ShipmentFeeList, 1)
    addCharges(b, ev.OrderChargeList, 1)
  }

  // 2. Remboursements (CA & frais négatifs / crédités)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of (fe.RefundEventList as any[]) || []) {
    const b = getBucket(buckets, ev.MarketplaceName || "Inconnu")
    events++
    for (const item of ev.ShipmentItemAdjustmentList || ev.ShipmentItemList || []) {
      addCharges(b, item.ItemChargeAdjustmentList || item.ItemChargeList, -1)
      addFees(b, item.ItemFeeAdjustmentList || item.ItemFeeList, -1)
    }
  }

  // 3. ServiceFee (stockage FBA, etc.) — compte-global → bucket synthétique
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of (fe.ServiceFeeEventList as any[]) || []) {
    const b = getBucket(buckets, "Amazon (global)")
    addFees(b, ev.FeeList, 1, (ev.FeeReason || "").toString())
  }

  // ── Conversion EUR (taux BCE fin de mois) + consolidation ──
  const fxDate = `${year}-${pad(month)}-${pad(end > now ? now.getUTCDate() : new Date(Date.UTC(year, month, 0)).getUTCDate())}`
  const currencies = [...new Set([...buckets.values()].map((b) => b.currency))]
  const rates = await eurPerUnit(fxDate, currencies)
  const fxMissing = new Set<string>()

  const total = { rev: newRev(), fee: newFee(), orders: 0 }
  const by_marketplace: AmazonMarketplaceLine[] = []

  for (const [name, b] of buckets) {
    if (name === "Inconnu" && b.orders === 0) continue
    const k = rates[b.currency]
    if (k == null) { fxMissing.add(b.currency); continue } // non converti → exclu du total
    // consolidation EUR
    total.rev.principal_gross += b.rev.principal_gross * k
    total.rev.principal_net += b.rev.principal_net * k
    total.rev.promo += b.rev.promo * k
    total.rev.shipping += b.rev.shipping * k
    total.rev.tax += b.rev.tax * k
    total.rev.refunds_principal += b.rev.refunds_principal * k
    total.fee.total += b.fee.total * k
    total.fee.referral += b.fee.referral * k
    total.fee.fba += b.fee.fba * k
    total.fee.storage += b.fee.storage * k
    total.fee.other += b.fee.other * k
    total.orders += b.orders

    const revNative = b.rev.principal_net + b.rev.promo
    by_marketplace.push({
      marketplace: name,
      currency: b.currency,
      revenue_native: r2(revNative),
      fees_native: r2(b.fee.total),
      revenue_eur: r2(revNative * k),
      fees_eur: r2(b.fee.total * k),
      orders: b.orders,
    })
  }
  by_marketplace.sort((a, z) => z.revenue_eur - a.revenue_eur)

  const revenue: AmazonRevenue = {
    revenue: r2(total.rev.principal_net + total.rev.promo),
    currency: "EUR",
    principal_gross: r2(total.rev.principal_gross),
    principal_net: r2(total.rev.principal_net),
    promo: r2(total.rev.promo),
    shipping: r2(total.rev.shipping),
    tax: r2(total.rev.tax),
    refunds_principal: r2(total.rev.refunds_principal),
    gross_sales: r2(total.rev.principal_gross + total.rev.shipping + total.rev.promo),
    orders: total.orders,
    events,
    by_marketplace,
    fx_missing: [...fxMissing],
  }
  const fees: AmazonFees = {
    total: r2(total.fee.total),
    referral: r2(total.fee.referral),
    fba: r2(total.fee.fba),
    storage: r2(total.fee.storage),
    other: r2(total.fee.other),
    currency: "EUR",
  }

  return { year, month, partial, revenue, fees, fetched_at: new Date().toISOString() }
}
