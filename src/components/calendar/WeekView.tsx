"use client"

import { Mail, Instagram, Youtube, Globe, Hash, Plus } from "lucide-react"
import { CalendarEvent, familyForType } from "./taxonomy"
import { DAYS_OF_WEEK, addDays, dayStr, eventCoversDate, eventStart } from "./utils"

interface Props {
  events: CalendarEvent[]
  weekStart: Date // lundi
  onSelect: (e: CalendarEvent) => void
  onCreate: (dateStr: string) => void
}

function channelIcon(channel?: string | null) {
  switch (channel) {
    case "email":
      return Mail
    case "instagram":
      return Instagram
    case "youtube":
      return Youtube
    case "web":
      return Globe
    default:
      return Hash
  }
}

export function WeekView({ events, weekStart, onSelect, onCreate }: Props) {
  const todayStr = dayStr(new Date())

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i)
        const dateStr = dayStr(date)
        const isToday = dateStr === todayStr
        const dayEvents = events
          .filter((e) => eventCoversDate(e, dateStr))
          .sort((a, b) => a.event_type.localeCompare(b.event_type))

        return (
          <div
            key={i}
            className={`flex min-h-[140px] flex-col rounded-xl border bg-white ${
              isToday ? "border-zinc-900" : "border-zinc-200"
            }`}
          >
            <div
              className={`flex items-center justify-between rounded-t-xl px-2.5 py-2 ${
                isToday ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-600"
              }`}
            >
              <span className="text-xs font-medium">
                {DAYS_OF_WEEK[i]}{" "}
                <span className={isToday ? "text-zinc-300" : "text-zinc-400"}>
                  {date.getDate()}
                </span>
              </span>
              <button
                onClick={() => onCreate(dateStr)}
                className={`flex h-5 w-5 items-center justify-center rounded ${
                  isToday ? "hover:bg-zinc-700" : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                }`}
                aria-label="Ajouter"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 space-y-1.5 p-2">
              {dayEvents.length === 0 ? (
                <div className="pt-2 text-center text-[11px] text-zinc-300">—</div>
              ) : (
                dayEvents.map((event) => {
                  const fam = familyForType(event.event_type)
                  const Icon = channelIcon(event.channel)
                  const isStart = eventStart(event) === dateStr
                  return (
                    <button
                      key={event.id}
                      onClick={() => onSelect(event)}
                      title={event.description || event.title}
                      className={`flex w-full items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left ${fam.pill} ${
                        isStart ? "" : "opacity-75"
                      }`}
                    >
                      <Icon className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                      <span className="text-[11px] font-medium leading-tight">
                        {event.title}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
