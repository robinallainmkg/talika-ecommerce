// Taxonomie partagée du Plan de Communication.
// Une "famille" regroupe plusieurs event_type pour le filtrage + la couleur.
// ⚠️ Les classes Tailwind sont des littéraux complets (scannés par le JIT) —
// ne jamais les construire par concaténation.

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  event_type: string
  scheduled_at: string
  end_at?: string | null // dérivé de metadata.end_date par l'API
  channel?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}

export type FamilyKey =
  | "offre"
  | "lancement"
  | "theme"
  | "event"
  | "newsletter"
  | "insta"

export interface FamilyDef {
  key: FamilyKey
  label: string
  types: string[] // event_type appartenant à cette famille (1er = type primaire)
  pill: string // pastille (vue mois / hebdo / listes)
  bar: string // barre pleine (vue annuelle)
  dot: string // point de légende / filtre
  text: string // couleur de texte d'accent
}

export const FAMILIES: FamilyDef[] = [
  {
    key: "offre",
    label: "Offres",
    types: ["promo"],
    pill: "bg-amber-50 text-amber-800 border-amber-200",
    bar: "bg-amber-300 text-amber-950",
    dot: "bg-amber-400",
    text: "text-amber-700",
  },
  {
    key: "lancement",
    label: "Lancements",
    types: ["launch"],
    pill: "bg-emerald-50 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500 text-white",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  {
    key: "theme",
    label: "Thématiques",
    types: ["campaign"],
    pill: "bg-violet-50 text-violet-800 border-violet-200",
    bar: "bg-violet-500 text-white",
    dot: "bg-violet-500",
    text: "text-violet-700",
  },
  {
    key: "event",
    label: "Événements",
    types: ["event", "meeting"],
    pill: "bg-sky-50 text-sky-800 border-sky-200",
    bar: "bg-sky-500 text-white",
    dot: "bg-sky-500",
    text: "text-sky-700",
  },
  {
    key: "newsletter",
    label: "Newsletters",
    types: ["newsletter", "email"],
    pill: "bg-rose-50 text-rose-800 border-rose-200",
    bar: "bg-rose-400 text-rose-950",
    dot: "bg-rose-400",
    text: "text-rose-700",
  },
  {
    key: "insta",
    label: "Posts insta",
    types: ["influence", "content", "social", "youtube", "ad_launch"],
    pill: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
    bar: "bg-fuchsia-400 text-fuchsia-950",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-700",
  },
]

const NEUTRAL: FamilyDef = {
  key: "event",
  label: "Autre",
  types: [],
  pill: "bg-zinc-100 text-zinc-700 border-zinc-200",
  bar: "bg-zinc-400 text-white",
  dot: "bg-zinc-400",
  text: "text-zinc-600",
}

const TYPE_TO_FAMILY: Record<string, FamilyDef> = (() => {
  const map: Record<string, FamilyDef> = {}
  for (const fam of FAMILIES) for (const t of fam.types) map[t] = fam
  return map
})()

export function familyForType(eventType: string): FamilyDef {
  return TYPE_TO_FAMILY[eventType] || NEUTRAL
}

export function familyByKey(key: FamilyKey): FamilyDef {
  return FAMILIES.find((f) => f.key === key) || NEUTRAL
}

// event_type primaire à écrire quand l'utilisateur choisit une famille dans la modale.
export function primaryTypeForFamily(key: FamilyKey): string {
  return familyByKey(key).types[0] || "event"
}

// Libellés de canaux proposés dans la modale.
export const CHANNEL_OPTIONS = [
  { value: "web", label: "Site / On-site" },
  { value: "email", label: "Email / Newsletter" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "social", label: "Social (autre)" },
] as const
