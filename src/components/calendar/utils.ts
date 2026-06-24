import type { CalendarEvent } from "./taxonomy"

export const MONTHS = [
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

export const MONTHS_SHORT = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
]

export const DAYS_OF_WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// YYYY-MM-DD à partir d'une date locale (sans décalage UTC).
export function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

export function eventStart(e: CalendarEvent): string {
  return e.scheduled_at.slice(0, 10)
}

export function eventEnd(e: CalendarEvent): string {
  return (e.end_at && e.end_at.slice(0, 10)) || eventStart(e)
}

// L'event couvre-t-il la date donnée (YYYY-MM-DD) ?
export function eventCoversDate(e: CalendarEvent, dateStr: string): boolean {
  return eventStart(e) <= dateStr && eventEnd(e) >= dateStr
}

export function isMultiDay(e: CalendarEvent): boolean {
  return eventEnd(e) !== eventStart(e)
}

// Grille mensuelle : cases (lundi=0) avec null pour les jours hors mois.
export function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDay = (firstDay.getDay() + 6) % 7 // Lundi = 0
  const days: (number | null)[] = []
  for (let i = 0; i < startDay; i++) days.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(i)
  return days
}

// Lundi de la semaine contenant `d`.
export function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const diff = (out.getDay() + 6) % 7 // jours depuis lundi
  out.setDate(out.getDate() - diff)
  out.setHours(0, 0, 0, 0)
  return out
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function fmtDayMonth(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })
}
