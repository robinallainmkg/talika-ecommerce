/**
 * Version unique de l'Admin API Shopify, pour TOUT le projet (REST + GraphQL).
 *
 * Shopify ne garde qu'une fenêtre glissante d'~1 an de versions supportées. Une
 * version périmée n'échoue PAS : elle est silencieusement servie par la plus
 * ancienne encore supportée (header `x-shopify-api-version-warning`) — donc le
 * code « marche » jusqu'au jour où le comportement change sans préavis.
 *
 * Vérifier les versions encore supportées :
 *   POST /admin/api/<version>/graphql.json  →  { publicApiVersions { handle supported } }
 *
 * Au 10/08/2026 : 2025-10, 2026-01, 2026-04, 2026-07 (2024-01 et 2024-10, qui
 * étaient codées en dur ici et là, étaient déjà périmées).
 * On reste volontairement une ou deux versions derrière la dernière.
 */
export const SHOPIFY_API_VERSION = "2026-01"
