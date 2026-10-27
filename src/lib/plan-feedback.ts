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
}

export const isShared = (r: { reviewer_email: string | null }) => r.reviewer_email === SHARED_AUTHOR

// rows : avis du lien partagé, dans n'importe quel ordre.
export function foldShared(rows: FeedbackRow[]): Record<string, SharedState> {
  const out: Record<string, SharedState> = {}
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const r of sorted) {
    const s = (out[r.item_id] ||= { validated: null, notes: [] })
    if (r.decision === "valide") s.validated = { at: r.created_at }
    else if (r.comment === CANCEL_MARK) s.validated = null
    else if (r.comment) s.notes.push({ at: r.created_at, text: r.comment })
  }
  return out
}
