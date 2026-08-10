// Dossier livraison : à partir du seul numéro de téléphone d'une conversation WhatsApp,
// reconstitue ce qu'on sait vraiment de la commande — pour répondre avec des faits
// et non le message générique « Colissimo, 48 h ».
//
// Chaîne (vérifiée le 24/07/2026 sur données réelles) :
//   téléphone -> profil Klaviyo -> email -> client Shopify -> commandes + expéditions
//                      \-> évènements de suivi colis Klaviyo (source la plus fraîche)
//
// Pourquoi deux sources de tracking : les `fulfillmentEvents` Shopify restent souvent
// bloqués sur CONFIRMED (le transporteur ne repousse pas tout vers Shopify), alors que
// les métriques colis Klaviyo (Package in transit / out for delivery / delivered) sont
// alimentées en continu. On lit les deux, Klaviyo arbitre quand il est plus récent.

import { SHOPIFY_API_VERSION } from "@/lib/shopify-api-version"

const KLAVIYO_REVISION = "2025-01-15"

// Métriques de suivi colis du compte Klaviyo FR (ids stables, relevés le 24/07/2026).
// `Package delayed` / `delivery exception` existent mais ne se déclenchent plus depuis 2023 :
// on les garde dans la liste, on ne compte pas dessus.
export const PACKAGE_METRICS: Record<string, string> = {
  Yb7MiP: "picked_up",
  XLTuHY: "in_transit",
  QULYVv: "out_for_delivery",
  TkdV4B: "delivered",
  TXeXFe: "delayed",
  RxN3y8: "exception",
}

export type PackageEvent = {
  status: string
  at: string
  orderName: string | null
  trackingNumber: string | null
  carrier: string | null
  /** Date de livraison estimée poussée par le transporteur — souvent absente côté Shopify. */
  estimatedDeliveryAt: string | null
  destination: string | null
}

export type DeliveryOrder = {
  name: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  total: string
  currency: string
  products: { title: string; quantity: number }[]
  shipments: {
    displayStatus: string | null
    carrier: string | null
    trackingNumber: string | null
    trackingUrl: string | null
    shippedAt: string | null
    inTransitAt: string | null
    deliveredAt: string | null
    estimatedDeliveryAt: string | null
  }[]
}

export type DeliveryContext = {
  phone: string
  matched: boolean
  /** Ce qui a permis (ou non) de rattacher la cliente. Affiché tel quel dans le drawer. */
  matchedVia: "klaviyo_profile" | "shopify_phone" | null
  klaviyoProfileId: string | null
  email: string | null
  firstName: string | null
  ordersLifetime: number
  amountSpent: string | null
  orders: DeliveryOrder[]
  packageEvents: PackageEvent[]
  /** Phrase factuelle prête à relire, jamais envoyée sans validation humaine. */
  summary: string
  warnings: string[]
}

const EMPTY = (phone: string, warnings: string[] = []): DeliveryContext => ({
  phone,
  matched: false,
  matchedVia: null,
  klaviyoProfileId: null,
  email: null,
  firstName: null,
  ordersLifetime: 0,
  amountSpent: null,
  orders: [],
  packageEvents: [],
  summary: "Aucune commande rattachée à ce numéro — demander l'email ou le numéro de commande.",
  warnings,
})

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) return null
  const response = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  if (!response.ok) return null
  const json = await response.json()
  if (json.errors) return null
  return json.data as T
}

async function klaviyo(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.KLAVIYO_API_KEY
  if (!key) return null
  const response = await fetch(`https://a.klaviyo.com/api/${path}`, {
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: KLAVIYO_REVISION,
      accept: "application/json",
    },
    cache: "no-store",
  })
  if (!response.ok) return null
  return response.json()
}

/** Normalise en E.164 français : 0612… -> +33612…, 33612… -> +33612… */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) return digits
  if (digits.startsWith("00")) return `+${digits.slice(2)}`
  if (digits.startsWith("33")) return `+${digits}`
  if (digits.startsWith("0")) return `+33${digits.slice(1)}`
  return `+${digits}`
}

type ProfileLookup = { id: string; email: string | null; firstName: string | null }

async function findKlaviyoProfile(phone: string): Promise<ProfileLookup | null> {
  const filter = encodeURIComponent(`equals(phone_number,"${phone}")`)
  const json = await klaviyo(
    `profiles?filter=${filter}&fields[profile]=email,phone_number,first_name`
  )
  const first = (json?.data as Array<Record<string, never>> | undefined)?.[0]
  if (!first) return null
  const attrs = (first as unknown as { id: string; attributes: { email?: string; first_name?: string } })
  return {
    id: attrs.id,
    email: attrs.attributes.email ?? null,
    firstName: attrs.attributes.first_name ?? null,
  }
}

type ShopifyCustomer = {
  customers: {
    nodes: Array<{
      numberOfOrders: string | number
      amountSpent: { amount: string; currencyCode: string } | null
      orders: {
        nodes: Array<{
          name: string
          createdAt: string
          displayFinancialStatus: string | null
          displayFulfillmentStatus: string | null
          totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
          lineItems: { nodes: Array<{ title: string; quantity: number }> }
          fulfillments: Array<{
            displayStatus: string | null
            createdAt: string | null
            inTransitAt: string | null
            deliveredAt: string | null
            estimatedDeliveryAt: string | null
            trackingInfo: Array<{ company: string | null; number: string | null; url: string | null }>
          }>
        }>
      }
    }>
  }
}

const CUSTOMER_QUERY = `
  query($q: String!) {
    customers(first: 1, query: $q) {
      nodes {
        numberOfOrders
        amountSpent { amount currencyCode }
        orders(first: 3, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 10) { nodes { title quantity } }
            fulfillments(first: 3) {
              displayStatus createdAt inTransitAt deliveredAt estimatedDeliveryAt
              trackingInfo { company number url }
            }
          }
        }
      }
    }
  }`

function mapOrders(data: ShopifyCustomer | null): {
  ordersLifetime: number
  amountSpent: string | null
  orders: DeliveryOrder[]
} {
  const customer = data?.customers?.nodes?.[0]
  if (!customer) return { ordersLifetime: 0, amountSpent: null, orders: [] }
  const orders: DeliveryOrder[] = (customer.orders?.nodes || []).map((o) => ({
    name: o.name,
    createdAt: o.createdAt,
    financialStatus: o.displayFinancialStatus,
    fulfillmentStatus: o.displayFulfillmentStatus,
    total: o.totalPriceSet.shopMoney.amount,
    currency: o.totalPriceSet.shopMoney.currencyCode,
    products: (o.lineItems?.nodes || []).map((l) => ({ title: l.title, quantity: l.quantity })),
    shipments: (o.fulfillments || []).map((f) => ({
      displayStatus: f.displayStatus,
      carrier: f.trackingInfo?.[0]?.company ?? null,
      trackingNumber: f.trackingInfo?.[0]?.number ?? null,
      trackingUrl: f.trackingInfo?.[0]?.url ?? null,
      shippedAt: f.createdAt,
      inTransitAt: f.inTransitAt,
      deliveredAt: f.deliveredAt,
      estimatedDeliveryAt: f.estimatedDeliveryAt,
    })),
  }))
  return {
    ordersLifetime: Number(customer.numberOfOrders) || orders.length,
    amountSpent: customer.amountSpent?.amount ?? null,
    orders,
  }
}

/** Klaviyo remplit certaines propriétés avec la chaîne "unknown" plutôt que de les omettre. */
const clean = (value: string | undefined): string | null =>
  !value || value === "unknown" || value === "None" ? null : value

/** Évènements de suivi colis Klaviyo des 30 derniers jours pour ce profil.
 *  Les 6 métriques sont interrogées EN PARALLÈLE (séquentiel = ~2-3 s d'attente drawer). */
async function fetchPackageEvents(profileId: string): Promise<PackageEvent[]> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const perMetric = await Promise.all(
    Object.entries(PACKAGE_METRICS).map(async ([metricId, status]) => {
      const filter = encodeURIComponent(
        `and(equals(metric_id,"${metricId}"),equals(profile_id,"${profileId}"),greater-than(datetime,${since}))`
      )
      const json = await klaviyo(`events?filter=${filter}&page[size]=5&sort=-datetime`)
      const rows = (json?.data as Array<{ attributes: { datetime: string; event_properties?: Record<string, unknown> } }> | undefined) || []
      return rows.map((row) => {
        // Clés relevées sur les évènements réels du compte le 24/07/2026.
        const p = row.attributes.event_properties || {}
        return {
          status,
          at: row.attributes.datetime,
          orderName: (p.order_number as string) ?? null,
          trackingNumber: (p.package_tracking_number as string) ?? null,
          carrier: (p.shipping_carrier as string) ?? null,
          // Klaviyo écrit littéralement "unknown" quand le transporteur ne donne pas de date.
          estimatedDeliveryAt: clean(p.est_delivery_date as string | undefined),
          destination: clean(p.shipping_destination as string | undefined),
        }
      })
    })
  )
  return perMetric.flat().sort((a, b) => (a.at < b.at ? 1 : -1))
}

function buildSummary(ctx: Omit<DeliveryContext, "summary">): string {
  const order = ctx.orders[0]
  if (!order) return "Profil retrouvé, mais aucune commande récente."
  const shipment = order.shipments[0]
  const latest = ctx.packageEvents[0]
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "—"

  const parts = [`Commande ${order.name} du ${day(order.createdAt)} (${order.total} ${order.currency}).`]
  if (!shipment) {
    parts.push(`Statut Shopify : ${order.fulfillmentStatus ?? "non expédiée"}. Pas encore de numéro de suivi.`)
    return parts.join(" ")
  }
  parts.push(
    `Expédiée le ${day(shipment.shippedAt)} par ${shipment.carrier ?? "transporteur inconnu"}` +
      (shipment.trackingNumber ? `, suivi ${shipment.trackingNumber}` : "") +
      // La destination change tout : « 48 h Colissimo » est faux pour un DOM-TOM ou l'étranger.
      (latest?.destination ? ` vers ${latest.destination}.` : ".")
  )
  if (latest) {
    const label: Record<string, string> = {
      picked_up: "pris en charge",
      in_transit: "en transit",
      out_for_delivery: "en cours de livraison",
      delivered: "livré",
      delayed: "retardé",
      exception: "incident de livraison",
    }
    parts.push(`Dernier point transporteur : ${label[latest.status] ?? latest.status} le ${day(latest.at)}.`)
    const eta = latest.estimatedDeliveryAt ?? shipment.estimatedDeliveryAt
    if (latest.status !== "delivered" && eta) parts.push(`Livraison estimée le ${day(eta)}.`)
  } else if (shipment.deliveredAt) {
    parts.push(`Livré le ${day(shipment.deliveredAt)} (source Shopify).`)
  } else {
    parts.push("Aucun évènement transporteur depuis l'expédition — à vérifier sur le suivi avant de répondre.")
  }
  return parts.join(" ")
}

/**
 * Point d'entrée. Lecture seule : n'écrit rien, n'envoie rien.
 * Retourne toujours un objet exploitable, jamais d'exception.
 */
export async function buildDeliveryContext(rawPhone: string): Promise<DeliveryContext> {
  const phone = normalizePhone(rawPhone)
  const warnings: string[] = []

  const profile = await findKlaviyoProfile(phone)

  // Chemin nominal : le profil Klaviyo donne l'email, l'email donne le client Shopify.
  if (profile?.email) {
    const [data, packageEvents] = await Promise.all([
      shopifyGraphql<ShopifyCustomer>(CUSTOMER_QUERY, { q: `email:${profile.email}` }),
      fetchPackageEvents(profile.id),
    ])
    const mapped = mapOrders(data)
    const base = {
      phone,
      matched: mapped.orders.length > 0,
      matchedVia: "klaviyo_profile" as const,
      klaviyoProfileId: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      ...mapped,
      packageEvents,
      warnings,
    }
    return { ...base, summary: buildSummary(base) }
  }

  // Repli : chercher directement le client Shopify par téléphone.
  // Un profil Klaviyo SANS email reste utile : on garde son id, son prénom et ses
  // évènements colis — seul le rattachement Shopify passe par le téléphone.
  if (!profile) warnings.push("Aucun profil Klaviyo pour ce numéro — recherche Shopify directe.")
  else warnings.push("Profil Klaviyo sans email — rattachement Shopify par téléphone.")
  const [data, packageEvents] = await Promise.all([
    shopifyGraphql<ShopifyCustomer>(CUSTOMER_QUERY, { q: `phone:${phone}` }),
    profile ? fetchPackageEvents(profile.id) : Promise.resolve([] as PackageEvent[]),
  ])
  const mapped = mapOrders(data)
  if (mapped.orders.length === 0 && !profile) return EMPTY(phone, warnings)
  const base = {
    phone,
    matched: mapped.orders.length > 0,
    matchedVia: mapped.orders.length > 0 ? ("shopify_phone" as const) : null,
    klaviyoProfileId: profile?.id ?? null,
    email: null,
    firstName: profile?.firstName ?? null,
    ...mapped,
    packageEvents,
    warnings,
  }
  return { ...base, summary: buildSummary(base) }
}
