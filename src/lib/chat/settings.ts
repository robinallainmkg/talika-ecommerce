import { SupabaseClient } from "@supabase/supabase-js"

export type BusinessHours = {
  timezone: string
  days: number[]
  start: string
  end: string
}

export async function getSettings(
  db: SupabaseClient,
  keys?: string[]
): Promise<Record<string, unknown>> {
  let query = db.from("chat_settings").select("key, value")
  if (keys && keys.length > 0) query = query.in("key", keys)
  const { data } = await query
  const out: Record<string, unknown> = {}
  for (const row of data || []) out[row.key] = row.value
  return out
}

export function isWithinBusinessHours(hours: BusinessHours | undefined): boolean {
  if (!hours || !hours.days || !hours.start || !hours.end) return true
  const now = new Date()
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: hours.timezone || "Europe/Paris",
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find((p) => p.type === "weekday")?.value || ""
  const hour = parts.find((p) => p.type === "hour")?.value || "00"
  const minute = parts.find((p) => p.type === "minute")?.value || "00"
  const dayMap: Record<string, number> = { "dim.": 0, "lun.": 1, "mar.": 2, "mer.": 3, "jeu.": 4, "ven.": 5, "sam.": 6 }
  const day = dayMap[weekday] ?? now.getDay()
  if (!hours.days.includes(day)) return false
  const current = `${hour}:${minute}`
  return current >= hours.start && current < hours.end
}
