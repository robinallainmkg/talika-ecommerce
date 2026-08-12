// Escalade DÉTERMINISTE vers l'humain — ne dépend PAS du LLM.
// Problème constaté en prod (conv. 9bd69c84, 12 messages bloqués) : le bot
// proposait « souhaitez-vous laisser un message ? » en boucle sans jamais ouvrir
// le formulaire (le marqueur <<<ASK_EMAIL>>> n'était pas émis), et un simple
// « oui » repartait en recherche produit → hallucination. Ici on garantit
// l'accès au SAV côté serveur, avant tout appel au modèle.

export type EscalationReason = "explicit" | "sav_topic" | "confirm"

// 1) Demande explicite d'un humain / du service client (FR + EN).
// « laisser/déposer un message » dit par le CLIENT compte aussi (vu en prod les
// 06-07/08 : 2 clientes non transmises, le bot affirmait à tort avoir transmis).
const HUMAN_INTENT =
  /\b(parler|joindre|contacter|appeler|discuter|échanger|avoir)\b[^.?!]{0,40}\b(humain|conseill\w+|personne|quelqu['’]un|une?\s+équipe|l['’]équipe|équipe\s+talika|agent|opérateur|service\s*client|sav|vrai\w*\s+(gens|personne))\b|\b(laiss\w*|dépos\w*)\b[^.?!]{0,30}\bmessage\b|leave\s+(a\s+|your\s+)?message|\b(un|une)\s+(humain|vraie?\s+personne|conseill\w+|opérateur)\b|\bservice\s*client\b|\bsav\b|talk\s+to\s+(a\s+|an\s+)?(human|agent|person|advisor|someone|representative)|speak\s+(to|with)\s+(a\s+|an\s+)?(human|agent|person)|customer\s+(service|support)|real\s+(human|person)/i

// 2) Sujets SAV durs qui dépassent le bot (codes promo, remboursements,
//    réclamations, colis/articles problématiques). On exige un signal de
//    PROBLÈME pour les codes/promos (sinon une simple question « c'est en promo ? »
//    déclencherait à tort).
// NB : on utilise \w* (et non \w+) après les radicaux accentués (« cassé »,
// « arrivé », « expiré »…) car \w n'inclut PAS les lettres accentuées en JS sans
// flag unicode → \w+ exigerait un caractère après l'accent et raterait le mot.
const SAV_PROMO = /\b(code|coupon|promo\w*|réduc\w*|bon\s+d['’]achat|cadeau)\b|-?\d{1,2}\s?%/i
const SAV_PROBLEM =
  /\b(pas|jamais|aucun\w*|rien)\b[^.?!]{0,20}\bre[çc]u\b|n['’]ai\s+(rien|pas|jamais)\s+re[çc]u|pas\s+(arriv\w*|fonctionn\w*|march\w*|valid\w*|appliqu\w*|encore)|ne\s+(marche|fonctionne|s['’]applique)\s+pas|invalide|expir\w*|erreur|problème|probleme|ne\s+passe\s+pas|didn['’]?t\s+(get|receive|work)|not\s+(received|working|valid)|expired/i
const SAV_OTHER =
  /\b(rembours\w*|réclamation|reclamation|litige|résilier|resilier|annul\w*\s+(ma|la|une|mon|cette|notre)\s+commande)\b|\b(colis|commande|article|produit|paquet|envoi|livraison)\b[^.?!]{0,30}\b(perdu\w*|égar\w*|jamais\s+(re[çc]u|arriv\w*|livr\w*)|pas\s+(re[çc]u|arriv\w*|livr\w*|encore)|non\s+re[çc]u|cass\w*|abîm\w*|abim\w*|défectu\w*|defectu\w*|endommag\w*|manquant|erron\w*|mauvais|ne\s+correspond)|\b(refund|return|complaint|broken|damaged|missing|defective|wrong\s+(item|product|order))\b/i

// 3) Confirmation courte (« oui ») juste après une proposition d'escalade.
// Accepte les politesses en suffixe (« oui svp », « oui merci », « oui je veux
// bien ») : la version mono-mot ratait « oui svp » (vu en prod le 17/06, la
// demande de transmission repartait en réponse produit).
const YES_WORD =
  "(?:oui+|ouais|ouaip|ok(?:ay|é)?|d['’]accord|volontiers|je\\s+veux\\s+bien|avec\\s+plaisir|carrément|bien\\s+sûr|yes+|yep|yeah|sure|please|s['’]il\\s+(?:vous|te)\\s+pla[îi]t|svp|stp|merci(?:\\s+beaucoup)?|thanks?(?:\\s+you)?)"
const SHORT_YES = new RegExp(`^\\s*(?!\\s*merci)${YES_WORD}(?:[\\s,.!]+${YES_WORD})*\\s*[.!\\s]*$`, "i")
const OFFERED_ESCALATION =
  /(laisser?\s+un\s+message|parler?\s+à\s+(un|notre|l['’])|transmet\w*\s+(à\s+(l['’]|notre)|votre|ta\s|sa\s|à\s+notre)|notre\s+équipe\s+(vous|pourra|se\s+fera)|un\s+conseiller|équipe\s+talika\s+(vous|pourra)|leave\s+(a\s+|your\s+)?message|talk\s+to\s+(our|the)\s+team)/i

export function isSavTopic(message: string): boolean {
  if (SAV_OTHER.test(message)) return true
  if (SAV_PROMO.test(message) && SAV_PROBLEM.test(message)) return true
  return false
}

export function detectEscalation(message: string, lastAssistant: string): EscalationReason | null {
  const m = (message || "").trim()
  if (!m) return null
  if (HUMAN_INTENT.test(m)) return "explicit"
  if (isSavTopic(m)) return "sav_topic"
  if (OFFERED_ESCALATION.test(lastAssistant || "") && SHORT_YES.test(m)) return "confirm"
  return null
}

// Horaires SAV : lundi-vendredi 9h-18h (Europe/Paris).
export function isBusinessHoursParis(): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const wd = parts.find((p) => p.type === "weekday")?.value || "Mon"
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value || "12", 10)
  if (hour === 24) hour = 0
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const weekday = days[wd] ?? 1
  return weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 18
}

// Message d'escalade chaleureux, qui cadre l'attente selon les horaires (sans
// fausse promesse de temps réel). Le visiteur reste libre de continuer à écrire :
// la conversation passe en file, ses messages suivants vont droit à l'équipe.
export function escalationMessage(locale: "fr" | "en"): string {
  const open = isBusinessHoursParis()
  if (locale === "en") {
    return open
      ? "Let me hand this over to the Talika team — they're best placed to help you here. I'm passing your request along now, and an advisor will reply right here in the chat. Feel free to leave your email if you'd also like a reply by mail."
      : "Let me hand this over to the Talika team. We're currently outside our hours (Monday to Friday, 9am–6pm Paris time), but I'm passing your message along — an advisor will reply here as soon as we reopen. Leave your email to also be notified by mail."
  }
  return open
    ? "Je préfère confier votre demande à l’équipe Talika, la mieux placée pour vous aider sur ce point. Je la transmets tout de suite — un conseiller vous répondra ici même. Vous pouvez me laisser votre email si vous souhaitez aussi une réponse par mail."
    : "Je préfère confier votre demande à l’équipe Talika. Nous sommes pour le moment en dehors de nos horaires (du lundi au vendredi, 9h-18h), mais je transmets votre message : un conseiller vous répondra ici dès l’ouverture. Laissez-moi votre email pour être prévenu(e) par mail également."
}
