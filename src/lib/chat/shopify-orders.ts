const API_VERSION = "2024-10"

export type OrderTracking = {
  company: string | null
  number: string | null
  url: string | null
  displayStatus: string | null
  deliveredAt: string | null
  estimatedDeliveryAt: string | null
}

export type OrderStatus = {
  name: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  itemCount: number
  trackings: OrderTracking[]
}

type OrderNode = {
  name: string
  email: string | null
  createdAt: string
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  subtotalLineItemsQuantity: number
  fulfillments: Array<{
    displayStatus: string | null
    deliveredAt: string | null
    estimatedDeliveryAt: string | null
    trackingInfo: Array<{ company: string | null; number: string | null; url: string | null }>
  }>
}

export type CustomerOrder = {
  name: string
  createdAt: string
  total: string
  currency: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  trackingUrl: string | null
}

export type CustomerInfo = {
  found: boolean
  ordersCount: number
  totalSpent: string | null
  currency: string | null
  orders: CustomerOrder[]
}

export async function lookupCustomerByEmail(email: string): Promise<CustomerInfo> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  const empty: CustomerInfo = { found: false, ordersCount: 0, totalSpent: null, currency: null, orders: [] }
  if (!domain || !token) return empty
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes("@")) return empty

  const query = `
    query($search: String!) {
      orders(first: 5, query: $search, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name createdAt
          displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          fulfillments(first: 1) { trackingInfo { url } }
        }
      }
    }`
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables: { search: `email:${clean}` } }),
  })
  if (!response.ok) return empty
  const json = await response.json()
  if (json.errors) return empty

  type Node = {
    name: string
    createdAt: string
    displayFinancialStatus: string | null
    displayFulfillmentStatus: string | null
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
    fulfillments: Array<{ trackingInfo: Array<{ url: string | null }> }>
  }
  const nodes: Node[] = json.data?.orders?.nodes || []
  if (nodes.length === 0) return empty

  const orders: CustomerOrder[] = nodes.map((o) => ({
    name: o.name,
    createdAt: o.createdAt,
    total: o.totalPriceSet.shopMoney.amount,
    currency: o.totalPriceSet.shopMoney.currencyCode,
    financialStatus: o.displayFinancialStatus,
    fulfillmentStatus: o.displayFulfillmentStatus,
    trackingUrl: o.fulfillments[0]?.trackingInfo[0]?.url || null,
  }))
  const currency = orders[0]?.currency || null
  const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.total || "0"), 0).toFixed(2)
  return { found: true, ordersCount: orders.length, totalSpent, currency, orders }
}

export async function lookupOrder(orderNumber: string, email: string): Promise<OrderStatus | null> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) throw new Error("config Shopify manquante")

  const digits = orderNumber.replace(/[^0-9]/g, "")
  if (!digits) return null
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes("@")) return null

  const query = `
    query($search: String!) {
      orders(first: 5, query: $search) {
        nodes {
          name email createdAt
          displayFinancialStatus displayFulfillmentStatus
          subtotalLineItemsQuantity
          fulfillments(first: 5) {
            displayStatus deliveredAt estimatedDeliveryAt
            trackingInfo { company number url }
          }
        }
      }
    }`
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables: { search: `name:#${digits}` } }),
  })
  if (!response.ok) throw new Error(`Shopify orders error: ${response.status}`)
  const json = await response.json()
  if (json.errors) throw new Error(`Shopify orders: ${JSON.stringify(json.errors).slice(0, 200)}`)

  const orders: OrderNode[] = json.data?.orders?.nodes || []
  const match = orders.find(
    (o) => o.name.replace(/[^0-9]/g, "") === digits && (o.email || "").toLowerCase() === cleanEmail
  )
  if (!match) return null

  return {
    name: match.name,
    createdAt: match.createdAt,
    financialStatus: match.displayFinancialStatus,
    fulfillmentStatus: match.displayFulfillmentStatus,
    itemCount: match.subtotalLineItemsQuantity,
    trackings: match.fulfillments.flatMap((f) =>
      f.trackingInfo.length > 0
        ? f.trackingInfo.map((t) => ({
            company: t.company,
            number: t.number,
            url: t.url,
            displayStatus: f.displayStatus,
            deliveredAt: f.deliveredAt,
            estimatedDeliveryAt: f.estimatedDeliveryAt,
          }))
        : [
            {
              company: null,
              number: null,
              url: null,
              displayStatus: f.displayStatus,
              deliveredAt: f.deliveredAt,
              estimatedDeliveryAt: f.estimatedDeliveryAt,
            },
          ]
    ),
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  })
}

export function buildOrderMessage(order: OrderStatus): string {
  const lines: string[] = []
  lines.push(
    `**Commande ${order.name}** du ${formatDate(order.createdAt)} (${order.itemCount} article${order.itemCount > 1 ? "s" : ""})`
  )

  const delivered = order.trackings.find((t) => t.deliveredAt)
  const status = (order.fulfillmentStatus || "").toUpperCase()

  if (delivered) {
    lines.push(`Votre commande a été **livrée** le ${formatDate(delivered.deliveredAt)}.`)
  } else if (status === "FULFILLED" || order.trackings.some((t) => t.number)) {
    lines.push("Votre commande a été **expédiée**.")
  } else if (status === "PARTIALLY_FULFILLED") {
    lines.push("Votre commande a été **partiellement expédiée**.")
  } else {
    lines.push("Votre commande est confirmée et **en cours de préparation**. Vous recevrez un email avec le lien de suivi dès son expédition.")
  }

  for (const t of order.trackings) {
    if (t.number) {
      const label = `${t.company ? t.company + " — " : ""}${t.number}`
      lines.push(t.url ? `Suivi : [${label}](${t.url})` : `Suivi : ${label}`)
    }
    if (!t.deliveredAt && t.estimatedDeliveryAt) {
      lines.push(`Livraison estimée : ${formatDate(t.estimatedDeliveryAt)}`)
    }
  }

  return lines.join("\n")
}
