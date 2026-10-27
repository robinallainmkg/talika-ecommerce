"use client"

import { useState } from "react"
import type { SharedState } from "@/lib/plan-feedback"

const NOTE_MAX = 1000
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

// Valider / annuler la validation / laisser une note sur une ligne du planning partagé.
// Tout passe par POST /api/share/calendar/feedback avec le jeton du lien.
export function Feedback({ token, itemId, initial }: { token: string; itemId: string; initial: SharedState }) {
  const [state, setState] = useState<SharedState>(initial)
  const [note, setNote] = useState("")
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(action: "valider" | "annuler" | "note") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/share/calendar/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, item_id: itemId, action, text: action === "note" ? note : undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Enregistrement impossible pour l'instant.")
      setState(json.state)
      if (action === "note") {
        setNote("")
        setWriting(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible pour l'instant.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      {state.notes.length > 0 && (
        <ul className="space-y-1">
          {state.notes.map((n) => (
            <li key={n.at} className="rounded-md bg-[var(--note-bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] break-words">
              <span className="text-xs text-[var(--muted)]">Note du {fmt(n.at)} : </span>
              {n.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {state.validated ? (
          <>
            <span className="text-sm font-medium text-[var(--ok-ink)]">✓ Validé le {fmt(state.validated.at)}</span>
            <button type="button" disabled={busy} onClick={() => send("annuler")} className="min-h-9 rounded-lg px-2 text-sm text-[var(--muted)] underline underline-offset-2 disabled:opacity-50">
              Annuler la validation
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => send("valider")} className="min-h-9 rounded-lg bg-[var(--ink)] px-3 text-sm font-medium text-[var(--bg)] disabled:opacity-50">
            Valider
          </button>
        )}
        {!writing && (
          <button type="button" disabled={busy} onClick={() => setWriting(true)} className="min-h-9 rounded-lg border border-[var(--line)] px-3 text-sm font-medium text-[var(--ink)] disabled:opacity-50">
            Ajouter une note
          </button>
        )}
      </div>
      {writing && (
        <div className="space-y-1.5">
          <label className="sr-only" htmlFor={`note-${itemId}`}>Votre note</label>
          <textarea
            id={`note-${itemId}`}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Votre note pour Robin (une question, une correction…)"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2 text-base text-[var(--ink)] sm:text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => send("note")} className="min-h-9 rounded-lg bg-[var(--ink)] px-3 text-sm font-medium text-[var(--bg)] disabled:opacity-50">
              Enregistrer la note
            </button>
            <button type="button" disabled={busy} onClick={() => { setWriting(false); setNote("") }} className="min-h-9 px-2 text-sm text-[var(--muted)] underline underline-offset-2">
              Fermer
            </button>
            <span className="text-xs text-[var(--muted)]">{note.length} / {NOTE_MAX}</span>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-[var(--bad-ink)]">{error}</p>}
    </div>
  )
}
