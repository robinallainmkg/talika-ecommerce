import { SupabaseClient } from "@supabase/supabase-js"

const WINDOW_MIN = 10
const WINDOW_MAX = 10
const HOURLY_MAX = 30

export type RateLimitResult = {
  allowed: boolean
  code?: "rate_limit" | "daily_limit"
  message?: string
  dailyRemaining: number | null
}

async function bumpWindowCounter(
  db: SupabaseClient,
  key: string,
  windowMinutes: number,
  windowMax: number,
  hourlyMax: number | null
): Promise<boolean> {
  const now = new Date()
  const { data: row } = await db.from("chat_rate_limits").select("*").eq("key", key).single()
  if (!row) {
    await db.from("chat_rate_limits").insert({
      key,
      message_count: 1,
      window_start: now.toISOString(),
      hourly_count: 1,
      hourly_start: now.toISOString(),
    })
    return true
  }
  let count = row.message_count
  let windowStart = row.window_start
  let hourlyCount = row.hourly_count
  let hourlyStart = row.hourly_start
  if ((now.getTime() - new Date(windowStart).getTime()) / 60000 > windowMinutes) {
    count = 0
    windowStart = now.toISOString()
  }
  if ((now.getTime() - new Date(hourlyStart).getTime()) / 60000 > 60) {
    hourlyCount = 0
    hourlyStart = now.toISOString()
  }
  if (count >= windowMax) return false
  if (hourlyMax !== null && hourlyCount >= hourlyMax) return false
  await db
    .from("chat_rate_limits")
    .update({
      message_count: count + 1,
      window_start: windowStart,
      hourly_count: hourlyCount + 1,
      hourly_start: hourlyStart,
      updated_at: now.toISOString(),
    })
    .eq("key", key)
  return true
}

export async function checkRateLimits(
  db: SupabaseClient,
  token: string,
  ip: string,
  dailyLimit: number
): Promise<RateLimitResult> {
  const sessionOk = await bumpWindowCounter(db, `sess:${token}`, WINDOW_MIN, WINDOW_MAX, null)
  if (!sessionOk) {
    return {
      allowed: false,
      code: "rate_limit",
      message: "Trop de messages. Réessayez dans quelques minutes.",
      dailyRemaining: null,
    }
  }

  if (ip !== "unknown") {
    const ipOk = await bumpWindowCounter(db, `ip:${ip}`, 60, HOURLY_MAX, HOURLY_MAX)
    if (!ipOk) {
      return {
        allowed: false,
        code: "rate_limit",
        message: "Limite horaire atteinte. Réessayez plus tard.",
        dailyRemaining: null,
      }
    }
  }

  let dailyRemaining: number | null = null
  if (ip !== "unknown" && dailyLimit > 0) {
    const today = new Date().toISOString().split("T")[0]
    const dailyKey = `daily:${ip}:${today}`
    const { data: daily } = await db
      .from("chat_rate_limits")
      .select("message_count")
      .eq("key", dailyKey)
      .single()
    const count = daily?.message_count || 0
    if (count >= dailyLimit) {
      return {
        allowed: false,
        code: "daily_limit",
        message:
          "Vous avez atteint la limite de messages du jour. Revenez demain, ou laissez un message à notre équipe qui vous répondra ici même.",
        dailyRemaining: 0,
      }
    }
    await db.from("chat_rate_limits").upsert(
      {
        key: dailyKey,
        message_count: count + 1,
        window_start: new Date().toISOString(),
        hourly_count: 0,
        hourly_start: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    )
    dailyRemaining = dailyLimit - 1 - count
  }

  return { allowed: true, dailyRemaining }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}
