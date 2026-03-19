"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mockCalendarEvents } from "@/lib/mock-data"
import type { CalendarEvent } from "@/types"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

const typeColors: Record<string, string> = {
  campaign: "bg-blue-100 text-blue-800 border-blue-200",
  newsletter: "bg-purple-100 text-purple-800 border-purple-200",
  social: "bg-pink-100 text-pink-800 border-pink-200",
  launch: "bg-emerald-100 text-emerald-800 border-emerald-200",
  event: "bg-amber-100 text-amber-800 border-amber-200",
  npd: "bg-red-100 text-red-800 border-red-200",
}

const typeLabels: Record<string, string> = {
  campaign: "Campagne",
  newsletter: "Newsletter",
  social: "Social",
  launch: "Lancement",
  event: "Événement",
  npd: "NPD",
}

const months = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
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

function getEventsForDay(events: CalendarEvent[], year: number, month: number, day: number) {
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  return events.filter((e) => {
    if (e.date === dateStr) return true
    if (e.endDate && e.date <= dateStr && e.endDate >= dateStr) return true
    return false
  })
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(2) // March
  const [currentYear, setCurrentYear] = useState(2026)

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

      <div className="p-6 space-y-6">
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

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px rounded-lg border border-zinc-200 bg-zinc-200 overflow-hidden">
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
                const events = day
                  ? getEventsForDay(mockCalendarEvents, currentYear, currentMonth, day)
                  : []
                const isToday =
                  day === 19 && currentMonth === 2 && currentYear === 2026

                return (
                  <div
                    key={i}
                    className={`min-h-[100px] bg-white p-1.5 ${
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
                          {events.map((event) => (
                            <div
                              key={event.id}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium truncate border ${typeColors[event.type]}`}
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
          </CardContent>
        </Card>

        {/* Upcoming events list */}
        <Card>
          <CardHeader>
            <CardTitle>Événements à venir</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockCalendarEvents
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeColors[event.type]}`}
                      >
                        {typeLabels[event.type]}
                      </span>
                      <div>
                        <h4 className="font-medium text-zinc-900">{event.title}</h4>
                        {event.description && (
                          <p className="text-xs text-zinc-500">{event.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-600">
                        {new Date(event.date).toLocaleDateString("fr-FR")}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {event.channel.map((ch) => (
                          <Badge key={ch} variant="default">
                            {ch}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
