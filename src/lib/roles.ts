// Rôles & périmètres d'accès — source unique partagée par le middleware (sandbox),
// la sidebar (navigation filtrée), /api/users (invitations) et requireRole (API).
//
// admin  : accès complet + gestion d'équipe.
// member : accès complet (legacy, équipe staff) — NON sandboxé.
// influence : sous-rôle sandboxé → ne voit QUE l'espace influence.
// sav    : sous-rôle sandboxé → ne voit QUE le chat.
export type Role = "admin" | "member" | "influence" | "sav"

// Les SOUS-RÔLES sandboxés. admin/member ne sont pas listés = aucun cloisonnement.
export const ROLE_SCOPE: Record<string, { home: string; allow: string[] }> = {
  influence: { home: "/influencers", allow: ["/influencers", "/api/influencers"] },
  sav: { home: "/chat", allow: ["/chat", "/api/chat"] },
}

// APIs transverses peu sensibles, autorisées à tout utilisateur connecté (sinon des
// composants partagés cassent : encarts insights, badges routine de la sidebar…).
export const SHARED_API = ["/api/insights", "/api/context", "/api/routine"]

// Gestion d'équipe : réservée à l'admin (invitations, suppression de comptes).
export const ADMIN_ONLY = ["/users", "/api/users"]

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  member: "Membre (accès complet)",
  influence: "Influence",
  sav: "SAV (chat)",
}

export const ASSIGNABLE_ROLES: Role[] = ["influence", "sav", "member", "admin"]

const prefixMatch = (pathname: string, p: string) =>
  pathname === p || pathname.startsWith(p + "/")

// Un chemin est-il autorisé pour un sous-rôle scopé (pages + API de son espace) ?
export function isAllowedForScope(pathname: string, scope: { allow: string[] }): boolean {
  return (
    scope.allow.some((p) => prefixMatch(pathname, p)) ||
    SHARED_API.some((p) => prefixMatch(pathname, p))
  )
}

// Accès d'une REQUÊTE selon le rôle, la méthode et le chemin.
// - admin / member : tout.
// - sous-rôle (influence/sav) : ÉCRITURE dans son espace (allow) ; LECTURE (GET +
//   pages) partout ailleurs ; gestion d'équipe (/users) interdite ; écriture API
//   hors espace propre interdite (vue seule).
export function isRequestAllowed(pathname: string, method: string, role: string): boolean {
  const scope = ROLE_SCOPE[role]
  if (!scope) return true
  if (isAllowedForScope(pathname, scope)) return true // espace propre → complet
  if (ADMIN_ONLY.some((p) => prefixMatch(pathname, p))) return false // équipe = admin
  if (!pathname.startsWith("/api/")) return true // pages = lecture autorisée
  return method === "GET" // API hors espace : seul le GET (vue) passe
}

// Un item de navigation (par href de page) est-il visible pour ce rôle ?
export function navVisibleForRole(href: string, role: string | null | undefined): boolean {
  const scope = role ? ROLE_SCOPE[role] : undefined
  if (!scope) return true // admin / member → tout
  // Sous-rôles : voient toute la navigation (lecture), sauf la gestion d'équipe.
  return !ADMIN_ONLY.some((p) => prefixMatch(href, p))
}
