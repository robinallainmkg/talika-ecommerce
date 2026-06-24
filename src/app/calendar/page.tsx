"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react"
import {
  CalendarEvent,
  FamilyKey,
  FAMILIES,
  familyForType,
} from "@/components/calendar/taxonomy"
import {
  MONTHS,
  startOfWeek,
  addDays,
  dayStr,
  eventStart,
  eventEnd,
  isMultiDay,
  fmtDayMonth,
} from "@/components/calendar/utils"
import { AnnualView } from "@/components/calendar/AnnualView"
import { MonthView } from "@/components/calendar/MonthView"
import { WeekView } from "@/components/calendar/WeekView"
import { EventModal } from "@/components/calendar/EventModal"

type View = "year" | "month" | "week"

const VIEWS: { key: View; label: string }[] = [
  { key: "year", label: "Année" },
  { key: "month", label: "Mois" },
  { key: "week", label: "Semaine" },
]

export default function CalendarPage() {
  const [view, setView] = useState<View>("year")
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Set<FamilyKey>>(
    new Set(FAMILIES.map((f) => f.key))
  )
  const [modal, setModal] = useState<{
    open: boolean
    event: CalendarEvent | null
    date: string | null
  }>({ open: false, event: null, date: null })

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/calendar/events", { cache: "no-store" })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setEvents(json.events || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const filtered = useMemo(
    () => events.filter((e) => active.has(familyForType(e.event_type).key)),
    [events, active]
  )

  const toggleFamily = (key: FamilyKey) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Navigation selon la vue.
  const shift = (dir: 1 | -1) => {
    setCursor((c) => {
      const d = new Date(c)
      if (view === "year") d.setFullYear(d.getFullYear() + dir)
      else if (view === "month") d.setMonth(d.getMonth() + dir)
      else d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor])

  const periodLabel = useMemo(() => {
    if (view === "year") return String(cursor.getFullYear())
    if (view === "month") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    const end = addDays(weekStart, 6)
    return `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()].slice(0, 4).toLowerCase()}. – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 4).toLowerCase()}. ${end.getFullYear()}`
  }, [view, cursor, weekStart])

  const openCreate = (date: string | null) =>
    setModal({ open: true, event: null, date })
  const openEdit = (event: CalendarEvent) =>
    setModal({ open: true, event, date: null })
  const closeModal = () => setModal({ open: false, event: null, date: null })

  // Liste "à venir" (depuis aujourd'hui), filtrée.
  const todayStr = dayStr(new Date())
  const upcoming = filtered
    .filter((e) => eventEnd(e) >= todayStr)
    .sort((a, b) => eventStart(a).localeCompare(eventStart(b)))
    .slice(0, 12)

  return (
    <div>
      <Header
        title="Plan de Communication"
        subtitle="Offres, lancements, thématiques, newsletters et posts insta"
        actions={
          <Button size="sm" onClick={() => openCreate(null)}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Toolbar : vue + navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  view === v.key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              {"Aujourd'hui"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[120px] text-center text-sm font-semibold capitalize text-zinc-900">
              {periodLabel}
            </span>
            <Button variant="ghost" size="sm" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filtres par famille */}
        <div className="flex flex-wrap gap-2">
          {FAMILIES.map((f) => {
            const on = active.has(f.key)
            return (
              <button
                key={f.key}
                onClick={() => toggleFamily(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on ? f.pill : "border-zinc-200 bg-white text-zinc-400 hover:bg-zinc-50"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${on ? f.dot : "bg-zinc-300"}`} />
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Vue active */}
        <Card>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                <span className="ml-2 text-zinc-500">Chargement…</span>
              </div>
            ) : view === "year" ? (
              <AnnualView
                events={filtered}
                year={cursor.getFullYear()}
                onSelect={openEdit}
                onCreate={openCreate}
              />
            ) : view === "month" ? (
              <MonthView
                events={filtered}
                year={cursor.getFullYear()}
                month={cursor.getMonth()}
                onSelect={openEdit}
                onCreate={openCreate}
              />
            ) : (
              <WeekView
                events={filtered}
                weekStart={weekStart}
                onSelect={openEdit}
                onCreate={openCreate}
              />
            )}
          </CardContent>
        </Card>

        {/* À venir */}
        <Card>
          <CardContent>
            <h3 className="mb-4 text-base font-semibold text-zinc-900">
              À venir
            </h3>
            {upcoming.length === 0 ? (
              <div className="py-6 text-center text-sm text-zinc-400">
                Aucun événement à venir.
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((event) => {
                  const fam = familyForType(event.event_type)
                  return (
                    <button
                      key={event.id}
                      onClick={() => openEdit(event)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 p-2.5 text-left hover:bg-zinc-50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${fam.dot}`} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {event.title}
                          </p>
                          {event.description && (
                            <p className="truncate text-xs text-zinc-500">
                              {event.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <span className="text-xs text-zinc-600">
                          {fmtDayMonth(eventStart(event))}
                          {isMultiDay(event) && (
                            <> → {fmtDayMonth(eventEnd(event))}</>
                          )}
                        </span>
                        {event.channel && event.channel !== "web" && (
                          <Badge variant="default">{event.channel}</Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {modal.open && (
        <EventModal
          event={modal.event}
          defaultDate={modal.date}
          onClose={closeModal}
          onSaved={fetchEvents}
        />
      )}
    </div>
  )
}
