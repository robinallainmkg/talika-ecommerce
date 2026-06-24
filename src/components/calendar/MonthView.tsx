"use client"

import { CalendarEvent, familyForType } from "./taxonomy"
import {
  DAYS_OF_WEEK,
  getCalendarDays,
  eventCoversDate,
  eventStart,
  dayStr,
} from "./utils"

interface Props {
  events: CalendarEvent[]
  year: number
  month: number
  onSelect: (e: CalendarEvent) => void
  onCreate: (dateStr: string) => void
}

export function MonthView({ events, year, month, onSelect, onCreate }: Props) {
  const days = getCalendarDays(year, month)
  const todayStr = dayStr(new Date())

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
      <div className="grid min-w-[640px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200">
        {DAYS_OF_WEEK.map((d) => (
          <div
            key={d}
            className="bg-zinc-50 p-2 text-center text-xs font-medium text-zinc-500"
          >
            {d}
          </div>
        ))}

        {days.map((day, i) => {
          if (!day) return <div key={i} className="min-h-[92px] bg-zinc-50/40" />
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const dayEvents = events.filter((e) => eventCoversDate(e, dateStr))
          const isToday = dateStr === todayStr

          return (
            <div
              key={i}
              onClick={() => onCreate(dateStr)}
              className="group min-h-[92px] cursor-copy bg-white p-1 transition-colors hover:bg-zinc-50 sm:p-1.5"
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday ? "bg-zinc-900 font-bold text-white" : "text-zinc-600"
                }`}
              >
                {day}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 4).map((event) => {
                  const fam = familyForType(event.event_type)
                  const isStart = eventStart(event) === dateStr
                  return (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(event)
                      }}
                      title={event.title}
                      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${fam.pill} ${
                        isStart ? "" : "opacity-70"
                      }`}
                    >
                      {event.title}
                    </button>
                  )
                })}
                {dayEvents.length > 4 && (
                  <div className="px-1.5 text-[10px] text-zinc-400">
                    +{dayEvents.length - 4}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
