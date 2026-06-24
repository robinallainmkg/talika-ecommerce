// Étapes du pipeline de prospection influence (par campagne × influenceuse).
export type Stage = "prospect" | "contacte" | "discussion" | "confirme" | "actif" | "decline"

export const STAGES: { key: Stage; label: string }[] = [
  { key: "prospect", label: "Prospect" },
  { key: "contacte", label: "Contacté" },
  { key: "discussion", label: "En discussion" },
  { key: "confirme", label: "Confirmé" },
  { key: "actif", label: "Actif" },
  { key: "decline", label: "Décliné" },
]

export const STAGE_KEYS = STAGES.map((s) => s.key)
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]))
export const isStage = (s: string): s is Stage => (STAGE_KEYS as string[]).includes(s)
