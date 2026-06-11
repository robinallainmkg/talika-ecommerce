const RULES: Array<{ intent: string; pattern: RegExp; response: string }> = [
  {
    intent: "greeting",
    pattern: /^(bonjour|bonsoir|salut|hello|coucou|hey)\b/i,
    response:
      "Bonjour ! Je suis l'assistante virtuelle de Talika. Posez-moi votre question sur nos produits — et si je ne peux pas y répondre, vous pourrez laisser un message à notre équipe.",
  },
  {
    intent: "shipping",
    pattern: /livraison|livr[eé]|exp[eé]di|colis|retour|rembours|commande/i,
    response:
      "Pour toute question sur une commande, une livraison ou un retour, le plus simple est de laisser un message à notre équipe : elle vous répondra ici même. Cliquez sur « Parler à un conseiller » ci-dessous.",
  },
  {
    intent: "price",
    pattern: /prix|tarif|co[uû]t|promo|r[eé]duction|code/i,
    response:
      "Les prix de nos produits sont indiqués sur leurs fiches sur talika.fr. Pour les offres en cours, consultez la page d'accueil — ou laissez un message à notre équipe pour une question précise.",
  },
  {
    intent: "contact",
    pattern: /humain|conseiller|quelqu'un|contact|t[eé]l[eé]phone|email|mail/i,
    response:
      "Bien sûr ! Cliquez sur « Parler à un conseiller » juste en dessous : laissez votre message (et votre email si vous souhaitez être prévenu·e), notre équipe vous répondra ici même.",
  },
]

const GENERIC =
  "Je rencontre une difficulté technique pour répondre en ce moment. Vous pouvez réessayer dans un instant, ou laisser un message à notre équipe via « Parler à un conseiller » — elle vous répondra ici même."

export const FALLBACK_MODEL = "fallback-rules"

export function fallbackResponse(message: string): { intent: string; response: string } {
  for (const rule of RULES) {
    if (rule.pattern.test(message)) return { intent: rule.intent, response: rule.response }
  }
  return { intent: "general", response: GENERIC }
}
