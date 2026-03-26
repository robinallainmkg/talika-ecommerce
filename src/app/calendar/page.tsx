"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase/client"
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react"

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  event_type: "email" | "social" | "ad_launch" | "content" | "meeting" | "launch"
  scheduled_at: string
  end_at?: string | null
  channel?: string | null
}

const typeColors: Record<string, string> = {
  email: "bg-blue-100 text-blue-800 border-blue-200",
  social: "bg-pink-100 text-pink-800 border-pink-200",
  ad_launch: "bg-amber-100 text-amber-800 border-amber-200",
  content: "bg-purple-100 text-purple-800 border-purple-200",
  meeting: "bg-zinc-100 text-zinc-800 border-zinc-200",
  launch: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const typeLabels: Record<string, string> = {
  email: "Email",
  social: "Social",
  ad_launch: "Pub",
  content: "Contenu",
  meeting: "Réunion",
  launch: "Lancement",
}

const months = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
]

const daysOfWeek = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = (firstDay.getDay() + 6) % 7 // Monday = 0
  const days: (number | null)[] = []

  for (let i = 0; i < startDay; i++) days.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(i)

  return days
}

function getEventsForDay(
  events: CalendarEvent[],
  year: number,
  month: number,
  day: number
) {
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return events.filter((e) => {
    const eventDate = e.scheduled_at.slice(0, 10)
    if (eventDate === dateStr) return true
    if (e.end_at) {
      const endDate = e.end_at.slice(0, 10)
      if (eventDate <= dateStr && endDate >= dateStr) return true
    }
    return false
  })
}

export default function CalendarPage() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from("calendar_events")
          .select("*")
          .order("scheduled_at", { ascending: true })

        if (error) throw error
        setEvents(data || [])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erreur lors du chargement"
        )
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const days = getCalendarDays(currentYear, currentMonth)

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  // Filter upcoming events (from today onward)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const upcomingEvents = events.filter(
    (e) => e.scheduled_at.slice(0, 10) >= todayStr
  )

  return (
    <div>
      <Header
        title="Plan de Communication"
        subtitle="Calendrier des campagnes, newsletters et lancements"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Calendar */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {months[currentMonth]} {currentYear}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(typeLabels).map(([key, label]) => (
                <span
                  key={key}
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeColors[key]}`}
                >
                  {label}
                </span>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                <span className="ml-2 text-zinc-500">Chargement...</span>
              </div>
            ) : (
              /* Calendar grid */
              <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
              <div className="grid grid-cols-7 gap-px rounded-lg border border-zinc-200 bg-zinc-200 overflow-hidden min-w-[640px]">
                {/* Header */}
                {daysOfWeek.map((day) => (
                  <div
                    key={day}
                    className="bg-zinc-50 p-2 text-center text-xs font-medium text-zinc-500"
                  >
                    {day}
                  </div>
                ))}

                {/* Days */}
                {days.map((day, i) => {
                  const dayEvents = day
                    ? getEventsForDay(events, currentYear, currentMonth, day)
                    : []
                  const isToday =
                    day === today.getDate() &&
                    currentMonth === today.getMonth() &&
                    currentYear === today.getFullYear()

                  return (
                    <div
                      key={i}
                      className={`min-h-[80px] sm:min-h-[100px] bg-white p-1 sm:p-1.5 ${
                        day ? "hover:bg-zinc-50" : "bg-zinc-50/50"
                      }`}
                    >
                      {day && (
                        <>
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                              isToday
                                ? "bg-zinc-900 text-white font-bold"
                                : "text-zinc-600"
                            }`}
                          >
                            {day}
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.map((event) => (
                              <div
                                key={event.id}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium truncate border ${typeColors[event.event_type] || "bg-zinc-100 text-zinc-700 border-zinc-200"}`}
                                title={event.title}
                              >
                                {event.title}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming events list */}
        <Card>
          <CardHeader>
            <CardTitle>Événements à venir</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                <span className="ml-2 text-zinc-500">Chargement...</span>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                Aucun événement à venir.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeColors[event.event_type] || "bg-zinc-100 text-zinc-700 border-zinc-200"}`}
                      >
                        {typeLabels[event.event_type] || event.event_type}
                      </span>
                      <div>
                        <h4 className="font-medium text-zinc-900">
                          {event.title}
                        </h4>
                        {event.description && (
                          <p className="text-xs text-zinc-500">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-600">
                        {new Date(event.scheduled_at).toLocaleDateString(
                          "fr-FR"
                        )}
                      </div>
                      {event.channel && (
                        <div className="mt-1">
                          <Badge variant="default">{event.channel}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
