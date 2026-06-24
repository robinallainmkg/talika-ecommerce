"use client"

import { useMemo } from "react"
import { CalendarEvent, familyForType } from "./taxonomy"
import { MONTHS_SHORT, eventStart, eventEnd, dayStr } from "./utils"

interface Props {
  events: CalendarEvent[]
  year: number
  onSelect: (e: CalendarEvent) => void
  onCreate: (dateStr: string) => void
}

interface PlacedBar {
  event: CalendarEvent
  startDay: number
  endDay: number
  lane: number
}

const LANE_H = 20
const LANE_GAP = 3
const PAD_V = 6

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export function AnnualView({ events, year, onSelect, onCreate }: Props) {
  const todayStr = dayStr(new Date())

  // Pour chaque mois : barres clippées au mois + affectation de lanes.
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const dim = daysInMonth(year, m)
      const monthStart = `${year}-${String(m + 1).padStart(2, "0")}-01`
      const monthEnd = `${year}-${String(m + 1).padStart(2, "0")}-${String(dim).padStart(2, "0")}`

      const overlapping = events
        .filter((e) => eventStart(e) <= monthEnd && eventEnd(e) >= monthStart)
        .sort((a, b) => eventStart(a).localeCompare(eventStart(b)))

      const laneEnds: number[] = []
      const bars: PlacedBar[] = overlapping.map((e) => {
        const s = eventStart(e)
        const en = eventEnd(e)
        const startDay = s < monthStart ? 1 : Number(s.slice(8, 10))
        const endDay = en > monthEnd ? dim : Number(en.slice(8, 10))
        let lane = laneEnds.findIndex((end) => end < startDay)
        if (lane === -1) {
          lane = laneEnds.length
          laneEnds.push(endDay)
        } else {
          laneEnds[lane] = endDay
        }
        return { event: e, startDay, endDay, lane }
      })

      const nLanes = Math.max(1, laneEnds.length)
      const rowH = PAD_V * 2 + nLanes * LANE_H + (nLanes - 1) * LANE_GAP
      return { m, dim, bars, rowH }
    })
  }, [events, year])

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5 md:-mx-6 px-4 sm:px-5 md:px-6">
      <div className="min-w-[680px] rounded-xl border border-zinc-200 overflow-hidden bg-white">
        {/* Axe des jours */}
        <div className="flex items-center border-b border-zinc-200 bg-zinc-50">
          <div className="w-12 shrink-0" />
          <div className="relative h-6 flex-1">
            {[1, 8, 15, 22, 29].map((d) => (
              <span
                key={d}
                className="absolute top-1 -translate-x-1/2 text-[10px] text-zinc-400"
                style={{ left: `${((d - 0.5) / 31) * 100}%` }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        {months.map(({ m, dim, bars, rowH }) => (
          <div
            key={m}
            className="flex items-stretch border-t border-zinc-100 first:border-t-0"
          >
            <div className="flex w-12 shrink-0 items-center justify-center bg-zinc-50 text-xs font-medium text-zinc-500">
              {MONTHS_SHORT[m]}
            </div>
            <div
              className="relative flex-1 cursor-copy"
              style={{ height: rowH }}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                const frac = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width))
                const day = Math.min(dim, Math.max(1, Math.floor(frac * dim) + 1))
                onCreate(`${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
              }}
            >
              {/* Gridlines hebdo */}
              {[8, 15, 22, 29].map((d) =>
                d <= dim ? (
                  <div
                    key={d}
                    className="pointer-events-none absolute inset-y-0 w-px bg-zinc-100"
                    style={{ left: `${((d - 1) / dim) * 100}%` }}
                  />
                ) : null
              )}

              {/* Marqueur aujourd'hui */}
              {todayStr.slice(0, 7) === `${year}-${String(m + 1).padStart(2, "0")}` && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-red-400"
                  style={{ left: `${((Number(todayStr.slice(8, 10)) - 0.5) / dim) * 100}%` }}
                />
              )}

              {bars.map(({ event, startDay, endDay, lane }) => {
                const fam = familyForType(event.event_type)
                const left = ((startDay - 1) / dim) * 100
                const width = ((endDay - startDay + 1) / dim) * 100
                return (
                  <button
                    key={event.id + "-" + m}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onSelect(event)
                    }}
                    title={event.title}
                    className={`absolute flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap hover:brightness-95 ${fam.bar}`}
                    style={{
                      left: `${left}%`,
                      width: `calc(${width}% - 2px)`,
                      top: PAD_V + lane * (LANE_H + LANE_GAP),
                      height: LANE_H,
                    }}
                  >
                    <span className="truncate">{event.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
