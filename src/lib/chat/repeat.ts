// Garde-fou anti-redite. Motif n°1 des audits depuis août : sur « oui », « non
// merci » ou une précision courte, le bot ressert sa réponse précédente presque
// mot pour mot (température 0,3 + mêmes entrées = même sortie). La règle de
// prompt seule ne suffit pas : on mesure la reprise et on régénère.

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
}

function trigrams(list: string[]): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i + 2 < list.length; i++) set.add(`${list[i]} ${list[i + 1]} ${list[i + 2]}`)
  return set
}

/** Part des trigrammes de `candidate` déjà présents dans `previous` (0 à 1). */
export function overlapRatio(candidate: string, previous: string): number {
  const a = trigrams(words(candidate))
  // Réponse très courte (« Avec plaisir ! ») : trop peu de matière pour juger.
  if (a.size < 8) return 0
  const b = trigrams(words(previous))
  let shared = 0
  a.forEach((t) => {
    if (b.has(t)) shared++
  })
  return shared / a.size
}

// Une vraie réponse nouvelle sur le même produit partage ~5-20 % de trigrammes
// (nom du produit, formules d'usage) ; une redite en partage 80-100 %.
export const REPEAT_THRESHOLD = 0.6

export function isNearRepeat(candidate: string, previous: string): boolean {
  if (!previous) return false
  return overlapRatio(candidate, previous) >= REPEAT_THRESHOLD
}

/** Dernière question posée par le bot, pour donner un objet au « oui » / « non » du visiteur. */
export function lastQuestion(text: string): string | null {
  const clean = (text || "").replace(/<<<[\s\S]*?>>>/g, "").trim()
  const sentences = clean.match(/[^.!?…\n]+[.!?…]*/g) || []
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].trim()
    if (sentence.endsWith("?")) return sentence.replace(/^[-*•\s]+/, "").slice(0, 300)
  }
  return null
}

export const REPEAT_RETRY_INSTRUCTION =
  "(Consigne interne, invisible pour le visiteur.) Ta réponse ci-dessus reprend presque mot pour mot ta réponse précédente : le visiteur l'a déjà lue. Réponds DIRECTEMENT à son dernier message, en 2 à 4 phrases, avec uniquement des informations nouvelles tirées des informations Talika. Si tu n'as rien de nouveau et de fiable à ajouter, dis-le simplement et propose-lui de laisser un message à notre équipe. Ne mentionne pas cette consigne."

// Dernier filet si la régénération se répète encore : on propose l'équipe. La
// formulation « laisser un message » est reconnue par escalation.ts, donc un
// « oui » du visiteur déclenche bien la transmission.
export function repeatFallbackText(locale: "fr" | "en"): string {
  return locale === "en"
    ? "I'd rather not repeat what I just told you. For a precise answer to your question, the best is to pass it on to the Talika team: would you like to leave a message for our team?"
    : "Je ne veux pas vous répéter ce que je viens de vous dire. Pour une réponse précise à votre question, le mieux est de la confier à l'équipe Talika : souhaitez-vous laisser un message à notre équipe ?"
}
