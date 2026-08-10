// « Action humaine nécessaire » — définition partagée entre l'API awaiting,
// la liste /chat (fils en rouge) et le badge SAV de la sidebar.
//
// Un fil attend un humain si :
//   - statut `queued` (le visiteur a demandé l'équipe), OU
//   - statut `human` ET le dernier message vient du visiteur (Meha doit répondre),
// SAUF si ce dernier message est un désabonnement WhatsApp : Klaviyo le traite
// automatiquement (confirmation envoyée), aucune action humaine à faire — sans ce
// filtre, une campagne WhatsApp mettrait 100+ fils en rouge d'un coup (vécu 08/08).
// « S'abonner » / « M'abonner » ne matche PAS : un réabonnement demande une action.
export const AUTO_HANDLED =
  /^\s*(se\s+d[ée]sabonner|me\s+d[ée]sabonner|d[ée]sabonner|stop)\s*[.!]*\s*$/i

// Préfixe posé par l'API admin sur les previews de messages visiteur.
export const VISITOR_PREFIX = "Visiteur : "

// Variante côté liste /chat : on n'a que la preview (préfixée) du dernier message.
export function needsHumanReply(status: string, lastMessagePreview: string): boolean {
  if (status === "queued") return true
  if (status !== "human") return false
  if (!lastMessagePreview.startsWith(VISITOR_PREFIX)) return false
  return !AUTO_HANDLED.test(lastMessagePreview.slice(VISITOR_PREFIX.length))
}
