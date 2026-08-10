import { SHOPIFY_API_VERSION } from "@/lib/shopify-api-version"

export type DiscountInfo = {
  found: boolean
  active: boolean
  status: string | null // ACTIVE | EXPIRED | SCHEDULED
  valueLabel: string | null // "-25%" / "-10 €" / "Livraison offerte"
  scopeLabel: string | null // "tous les articles" / "certains produits"
  endsAt: string | null
}

// Vérifie un code de réduction via l'API Admin (codeDiscountNodeByCode).
// IMPORTANT : ne donne QUE la valeur d'entête du code. Les plafonds/exclusions
// par produit (ex. Led Mask 10%, nouveautés 0%) sont calculés par les Shopify
// Functions au moment du panier et NE SONT PAS exposés ici → d'où le disclaimer.
export async function lookupDiscountCode(code: string): Promise<DiscountInfo> {
  const empty: DiscountInfo = {
    found: false,
    active: false,
    status: null,
    valueLabel: null,
    scopeLabel: null,
    endsAt: null,
  }
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ACCESS_TOKEN
  if (!domain || !token) return empty
  const clean = code.trim()
  if (!clean) return empty

  const query = `
    query($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            status endsAt
            customerGets {
              value {
                __typename
                ... on DiscountPercentage { percentage }
                ... on DiscountAmount { amount { amount currencyCode } }
              }
              items { __typename }
            }
          }
          ... on DiscountCodeFreeShipping { status endsAt }
          ... on DiscountCodeBxgy { status endsAt }
          ... on DiscountCodeApp { status endsAt }
        }
      }
    }`

  const response = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables: { code: clean } }),
  })
  if (!response.ok) return empty
  const json = await response.json()
  if (json.errors) return empty
  const d = json.data?.codeDiscountNodeByCode?.codeDiscount
  if (!d) return empty

  let valueLabel: string | null = null
  let scopeLabel: string | null = null
  if (d.__typename === "DiscountCodeBasic") {
    const v = d.customerGets?.value
    if (v?.__typename === "DiscountPercentage" && typeof v.percentage === "number") {
      valueLabel = `-${Math.round(v.percentage * 100)}%`
    } else if (v?.__typename === "DiscountAmount" && v.amount) {
      const cur = v.amount.currencyCode === "EUR" ? "€" : v.amount.currencyCode
      valueLabel = `-${Math.round(parseFloat(v.amount.amount))} ${cur}`
    }
    const items = d.customerGets?.items?.__typename
    scopeLabel = items === "AllDiscountItems" ? "tous les articles" : items ? "certains produits" : null
  } else if (d.__typename === "DiscountCodeFreeShipping") {
    valueLabel = "Livraison offerte"
  }

  return {
    found: true,
    active: d.status === "ACTIVE",
    status: d.status || null,
    valueLabel,
    scopeLabel,
    endsAt: d.endsAt || null,
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

export function buildDiscountMessage(code: string, info: DiscountInfo): string {
  const c = code.trim().toUpperCase()
  if (!info.found) {
    return `Je ne trouve pas de code correspondant à **${c}**. Vérifiez l'orthographe — ou je peux transmettre votre demande à notre équipe, qui vérifiera pour vous.`
  }
  if (!info.active) {
    const why =
      info.status === "EXPIRED"
        ? "il a expiré"
        : info.status === "SCHEDULED"
          ? "il n'est pas encore actif"
          : "il n'est pas actif pour le moment"
    return `Le code **${c}** existe, mais ${why}. Je peux transmettre votre demande à notre équipe si vous pensez qu'il devrait fonctionner.`
  }
  const lines: string[] = []
  if (info.valueLabel) {
    lines.push(
      `✓ Le code **${c}** est bien actif : **${info.valueLabel}**${info.scopeLabel ? ` sur ${info.scopeLabel}` : ""}${info.endsAt ? `, jusqu'au ${formatDate(info.endsAt)}` : ""}.`
    )
  } else {
    lines.push(`✓ Le code **${c}** est bien actif${info.endsAt ? `, jusqu'au ${formatDate(info.endsAt)}` : ""}.`)
  }
  lines.push(
    "⚠️ Je n'ai pas le détail de chaque promotion : certains produits (nouveautés, éditions limitées, masque LED…) peuvent être exclus ou avoir une remise réduite. Le **montant exact s'affiche dans votre panier** au moment d'appliquer le code."
  )
  lines.push("Besoin d'une confirmation précise ? Je peux transmettre votre demande à notre équipe.")
  return lines.join("\n\n")
}
