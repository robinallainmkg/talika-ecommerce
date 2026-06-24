// Rôles, SECTIONS & accès par personne — source unique partagée par le middleware
// (sandbox), la sidebar (navigation filtrée) et /api/users (gestion d'équipe).
//
// Modèle : l'accès est MODULABLE par personne.
//  - Le dashboard est découpé en SECTIONS (cf. SECTIONS ci-dessous).
//  - Chaque RÔLE est un preset de sections (admin = tout ; member = tout sauf
//    Équipe ; influence/sav = leur espace).
//  - Chaque utilisateur peut avoir une liste explicite `sections` (dans
//    user_metadata) qui REMPLACE le preset → l'admin maîtrise au cas par cas.
//  - admin = toujours tout (anti-verrouillage). "equipe" = admin uniquement.
//
// Filtrage : les PAGES et les ÉCRITURES (POST/PATCH/DELETE) sont gated par section.
// Les API GET restent ouvertes à tout utilisateur connecté (vue) pour ne pas casser
// les widgets transverses (insights, badges…). Isolation dure des données = RLS.
export type Role = "admin" | "member" | "influence" | "sav"

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  member: "Membre (accès complet)",
  influence: "Influence",
  sav: "SAV (chat)",
}

export const ASSIGNABLE_ROLES: Role[] = ["influence", "sav", "member", "admin"]

// Sections = découpage fonctionnel du dashboard. `paths` = préfixes (pages + API)
// rattachés à la section. L'ordre définit la page d'accueil de repli (1ʳᵉ accessible).
export interface Section { key: string; label: string; paths: string[] }
export const SECTIONS: Section[] = [
  { key: "dashboard",    label: "Dashboard",    paths: ["/dashboard", "/sales", "/traffic", "/api/dashboard", "/api/sync", "/api/sales"] },
  { key: "opportunites", label: "Opportunités", paths: ["/opportunities", "/api/opportunities", "/api/analysis"] },
  { key: "acquisition",  label: "Acquisition",  paths: ["/acquisition", "/ads", "/klaviyo", "/api/acquisition", "/api/meta", "/api/klaviyo", "/api/google"] },
  { key: "influence",    label: "Influence",    paths: ["/influencers", "/api/influencers"] },
  { key: "performance",  label: "Performance",  paths: ["/objectives", "/generosite", "/pnl", "/api/objectives", "/api/generosite", "/api/pnl"] },
  { key: "chat",         label: "Chat IA",      paths: ["/chat", "/api/chat"] },
  { key: "calendar",     label: "Calendrier",   paths: ["/calendar", "/api/calendar"] },
  { key: "projets",      label: "Projets",      paths: ["/projects", "/api/projects"] },
  { key: "equipe",       label: "Équipe",       paths: ["/users", "/api/users"] },
]

export const SECTION_KEYS = SECTIONS.map((s) => s.key)
export const SECTION_LABEL: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]))

// Sections assignables à un sous-rôle (tout sauf la gestion d'équipe, réservée admin).
export const GRANTABLE_SECTIONS = SECTION_KEYS.filter((k) => k !== "equipe")

// Preset de sections par rôle (point de départ ; surchargé par user_metadata.sections).
export const ROLE_PRESET: Record<string, string[]> = {
  admin: SECTION_KEYS,
  member: GRANTABLE_SECTIONS,
  influence: ["influence"],
  sav: ["chat"],
}

// API transverses peu sensibles, autorisées à tout utilisateur connecté (sinon des
// composants partagés cassent : encarts insights, badges routine de la sidebar…).
export const SHARED_API = ["/api/insights", "/api/context", "/api/routine"]

const prefixMatch = (pathname: string, p: string) =>
  pathname === p || pathname.startsWith(p + "/")

/** Sections EFFECTIVES d'un utilisateur (override explicite sinon preset du rôle). */
export function userSections(role: string | null | undefined, metaSections?: unknown): Set<string> {
  if (role === "admin") return new Set(SECTION_KEYS) // admin = tout, jamais verrouillable
  let keys: string[]
  if (Array.isArray(metaSections)) {
    // Override explicite : on ne garde que des clés valides, jamais "equipe".
    keys = metaSections.filter((k): k is string => typeof k === "string" && GRANTABLE_SECTIONS.includes(k))
  } else {
    keys = ROLE_PRESET[role || "member"] ?? GRANTABLE_SECTIONS
  }
  return new Set(keys)
}

/** Section à laquelle appartient un chemin (page ou API), ou null si non rattaché. */
export function sectionForPath(pathname: string): string | null {
  for (const s of SECTIONS) if (s.paths.some((p) => prefixMatch(pathname, p))) return s.key
  return null
}

// Accès d'une REQUÊTE : pages + écritures filtrées par section ; GET ouvert (vue).
export function isRequestAllowed(pathname: string, method: string, role: string, metaSections?: unknown): boolean {
  if (role === "admin") return true
  const sec = sectionForPath(pathname)
  if (sec === "equipe") return false // gestion d'équipe = admin uniquement
  const isApi = pathname.startsWith("/api/")
  if (!isApi) return sec ? userSections(role, metaSections).has(sec) : true // page
  if (SHARED_API.some((p) => prefixMatch(pathname, p))) return true
  if (method === "GET" || method === "HEAD") return true // lecture ouverte
  return sec ? userSections(role, metaSections).has(sec) : true // écriture API
}

// Un item de navigation (par href de page) est-il visible pour cet utilisateur ?
export function navVisible(href: string, role: string | null | undefined, metaSections?: unknown): boolean {
  const sec = sectionForPath(href)
  if (sec === "equipe") return role === "admin"
  if (role === "admin") return true
  return sec ? userSections(role, metaSections).has(sec) : true
}

// Page d'accueil de repli = première section accessible (hors équipe).
export function homeFor(role: string | null | undefined, metaSections?: unknown): string {
  const set = userSections(role, metaSections)
  for (const s of SECTIONS) if (s.key !== "equipe" && set.has(s.key)) return s.paths[0]
  return "/login"
}
