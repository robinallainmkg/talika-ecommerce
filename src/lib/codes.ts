// Normalisation canonique d'un code promo.
// Les codes saisis dans Shopify arrivent avec des espaces parasites, des accents
// et une casse variable (ex. "CS-RETOUR ", "CS- ENDOMMAGÉ", "bb20"). Sans
// normalisation, le matching exact échoue et un code POURTANT catégorisé ressort
// comme "à catégoriser". On normalise donc partout pareil avant de comparer.
//
// Source de vérité de la catégorisation = table `influencer_codes.code_type`.
// JAMAIS de regex codée en dur pour catégoriser (cf knowledge_base glossary:generosite).
export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "")
    .normalize("NFD") // décompose les accents
    .replace(/[̀-ͯ]/g, "") // enlève les diacritiques (É → E)
    .replace(/\s+/g, "") // enlève tous les espaces (parasites)
    .toUpperCase()
}

// Libellés d'affichage des catégories (= valeurs de influencer_codes.code_type)
export const CODE_TYPE_LABELS: Record<string, string> = {
  influencer: "Codes Influenceurs",
  gifting: "Dotations (MKG)",
  welcome: "Codes Génériques (Welcome)",
  offre_site: "Prix barrés", // démarques compare_at_price (soldes) — alimenté par le calcul line-items, pas par un code
  auto_discounts: "Remises automatiques (volume)",
  logistique: "Erreurs Logistiques (La Poste)",
  service_client: "Retours / SAV (exclu)",
  presse: "Presse",
  autre: "Autres codes",
}

// Catégories EXCLUES du taux de générosité (SAV = pas de la vraie générosité).
export const GENEROSITE_EXCLUDED_TYPES = ["service_client"] as const
