// Notes et validations laissées depuis le lien partagé du planning (/share/calendar?t=…).
// Stockées dans marketing_plan_reviews (table existante, aucune migration) :
//   - validation           : decision = "valide",  comment = null
//   - annulation           : decision = "retours", comment = CANCEL_MARK
//   - note libre           : decision = "retours", comment = le texte
// reviewer_email = SHARED_AUTHOR, reviewer_id = shareTokenId(jeton) (quel lien a écrit).
// Pilotage (routines brief-matin / planning-emails) les lit comme les autres avis (processed = false).

export const SHARED_AUTHOR = "Sophie (lien partagé)"
export const CANCEL_MARK = "[Validation annulée]"
export const NOTE_MAX = 1000
export const WRITES_PER_HOUR = 30

export interface FeedbackRow {
  id?: string
  item_id: string
  decision: "valide" | "retours"
  comment: string | null
  reviewer_email: string | null
  created_at: string
}

export interface SharedState {
  validated: { at: string } | null
  notes: { at: string; text: string }[]
  // Validation antérieure au lien partagé (Robin dans le chat, ou l'équipe dans la vue interne) : la ligne
  // est déjà validée, on ne la redemande pas (Robin, 27/10 : « j'ai validé des trucs qu'on a déjà validés »).
  prior?: { by: string; at: string | null } | null
}

// Écritures de test faites avec un jeton de TEST (27/10) : jamais montrées à l'équipe.
export const TEST_PREFIX = "TEST Claude"
const isTest = (r: { comment: string | null }) => !!r.comment && r.comment.startsWith(TEST_PREFIX)

// Validation déjà acquise pour une ligne :
//   1. payload.deja_valide = { par, le, source } écrit par Pilotage (validation donnée dans le chat, avec sa source) ;
//   2. sinon le dernier avis de la vue interne (/calendar/planning, compte connecté) s'il vaut « valide ».
export function priorValidation(
  payload: Record<string, unknown> | null | undefined,
  internal: FeedbackRow[] = []
): { by: string; at: string | null } | null {
  const dv = payload?.deja_valide as { par?: unknown; le?: unknown } | undefined
  if (dv && typeof dv === "object") {
    const by = typeof dv.par === "string" && dv.par.trim() ? dv.par.trim() : "Robin"
    const at = typeof dv.le === "string" && /^\d{4}-\d{2}-\d{2}/.test(dv.le) ? dv.le.slice(0, 10) : null
    return { by, at }
  }
  const last = [...internal].filter((r) => !isShared(r)).sort((a, b) => a.created_at.localeCompare(b.created_at)).pop()
  return last && last.decision === "valide" ? { by: "l'équipe", at: last.created_at } : null
}

export const isShared = (r: { reviewer_email: string | null }) => r.reviewer_email === SHARED_AUTHOR

// rows : avis du lien partagé, dans n'importe quel ordre.
export function foldShared(rows: FeedbackRow[]): Record<string, SharedState> {
  const out: Record<string, SharedState> = {}
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const r of sorted) {
    if (isTest(r)) continue
    const s = (out[r.item_id] ||= { validated: null, notes: [] })
    if (r.decision === "valide") s.validated = { at: r.created_at }
    else if (r.comment === CANCEL_MARK) s.validated = null
    else if (r.comment) s.notes.push({ at: r.created_at, text: r.comment })
  }
  return out
}
