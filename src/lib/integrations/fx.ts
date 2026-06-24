/**
 * FX → EUR. Taux de référence BCE via Frankfurter (gratuit, sans clé, pas de LLM).
 * Sert à consolider en EUR les marketplaces Amazon non-euro (UK=GBP, SE=SEK, PL=PLN…).
 *
 * Robuste : si l'appel échoue, on renvoie un taux 1 pour l'EUR et `null` pour les
 * devises non résolues → l'appelant décide (on flag plutôt que de fausser le total).
 */
const _cache = new Map<string, Record<string, number>>()

/**
 * Renvoie, pour une `date` (YYYY-MM-DD) et une liste de devises, le nombre d'EUR
 * que vaut 1 unité de chaque devise (EUR→1). Frankfurter retombe automatiquement
 * sur le dernier jour ouvré si `date` est un week-end/férié.
 */
export async function eurPerUnit(date: string, currencies: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = { EUR: 1 }
  const need = [...new Set(currencies)].filter((c) => c && c !== "EUR")
  if (need.length === 0) return out

  const cacheKey = `${date}|${need.sort().join(",")}`
  const cached = _cache.get(cacheKey)
  if (cached) return { ...out, ...cached }

  try {
    // Frankfurter : base EUR → renvoie combien de <devise> vaut 1 EUR. On inverse.
    const url = `https://api.frankfurter.app/${date}?from=EUR&to=${need.join(",")}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`frankfurter ${res.status}`)
    const data = await res.json()
    const rates = data?.rates || {}
    const resolved: Record<string, number> = {}
    for (const c of need) {
      const eurToC = Number(rates[c])
      if (eurToC > 0) resolved[c] = 1 / eurToC // 1 unité de C = (1/eurToC) EUR
    }
    _cache.set(cacheKey, resolved)
    return { ...out, ...resolved }
  } catch {
    return out // EUR seulement ; les devises non résolues seront flaggées par l'appelant
  }
}
