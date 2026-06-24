"use client"

import { useEffect, useState } from "react"
import { X, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  CalendarEvent,
  FamilyKey,
  FAMILIES,
  CHANNEL_OPTIONS,
  familyForType,
  primaryTypeForFamily,
} from "./taxonomy"
import { eventStart, eventEnd } from "./utils"

interface Props {
  event: CalendarEvent | null // null = création
  defaultDate?: string | null // YYYY-MM-DD pré-rempli en création
  onClose: () => void
  onSaved: () => void // refetch après save/delete
}

export function EventModal({ event, defaultDate, onClose, onSaved }: Props) {
  const isEdit = !!event
  const originalFamily = event ? familyForType(event.event_type).key : "offre"
  const originalType = event?.event_type

  const [title, setTitle] = useState(event?.title ?? "")
  const [family, setFamily] = useState<FamilyKey>(originalFamily)
  const [channel, setChannel] = useState(event?.channel ?? "web")
  const [start, setStart] = useState(
    event ? eventStart(event) : defaultDate ?? ""
  )
  const [end, setEnd] = useState(
    event ? (eventEnd(event) !== eventStart(event) ? eventEnd(event) : "") : ""
  )
  const [description, setDescription] = useState(event?.description ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fermer sur Échap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSave() {
    setError(null)
    if (!title.trim()) {
      setError("Le titre est requis.")
      return
    }
    if (!start) {
      setError("La date de début est requise.")
      return
    }
    if (end && end < start) {
      setError("La date de fin doit être après la date de début.")
      return
    }
    setSaving(true)
    try {
      const event_type =
        isEdit && family === originalFamily && originalType
          ? originalType
          : primaryTypeForFamily(family)

      const payload = {
        title: title.trim(),
        event_type,
        channel,
        scheduled_at: start,
        end_at: end || null,
        description: description.trim() || null,
      }

      const res = await fetch(
        isEdit ? `/api/calendar/events/${event!.id}` : "/api/calendar/events",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "Erreur")
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    if (!confirm(`Supprimer « ${event.title} » ?`)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "Erreur")
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression")
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-zinc-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">
            {isEdit ? "Modifier l'événement" : "Nouvel événement"}
          </h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Soldes été, Lancement Brume Vit C, NL Glow…"
              autoFocus
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Famille
            </label>
            <div className="flex flex-wrap gap-2">
              {FAMILIES.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFamily(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    family === f.key
                      ? f.pill + " ring-2 ring-offset-1 ring-zinc-300"
                      : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${f.dot}`} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Début
              </label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">
                Fin <span className="text-zinc-400">(optionnel)</span>
              </label>
              <input
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Canal
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            >
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Description <span className="text-zinc-400">(optionnel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Détails, produits concernés, mécanique…"
              className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-4">
          {isEdit ? (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
