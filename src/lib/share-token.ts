import { createHmac, timingSafeEqual } from "crypto"

// Liens de partage en lecture seule, sans compte (ex. /share/calendar?t=…).
// Jeton = "<expiration unix>.<signature base64url>", signé HMAC-SHA256 avec une clé
// dérivée de CRON_SECRET et du nom de la ressource (un jeton « calendar » ne vaut que
// pour le calendrier). Aucun état côté serveur : le lien meurt tout seul à l'expiration.
// Générer un lien : node scripts/gen-share-link.mjs calendar "2026-10-27T23:59:59+01:00"

const MAX_TTL_S = 7 * 24 * 3600 // garde-fou : jamais un lien de plus de 7 jours

function key(scope: string): Buffer | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return null
  return createHmac("sha256", secret).update(`share-link:v1:${scope}`).digest()
}

function sign(scope: string, exp: number): string | null {
  const k = key(scope)
  if (!k) return null
  return createHmac("sha256", k).update(`${scope}.${exp}`).digest("base64url")
}

export type ShareCheck = { ok: true; exp: number } | { ok: false; reason: "absent" | "invalide" | "expire" }

export function verifyShareToken(scope: string, token: string | null | undefined, now = Date.now()): ShareCheck {
  if (!token) return { ok: false, reason: "absent" }
  const m = /^(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!m) return { ok: false, reason: "invalide" }
  const exp = Number(m[1])
  const expected = sign(scope, exp)
  if (!expected) return { ok: false, reason: "invalide" }
  const a = Buffer.from(m[2])
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalide" }
  const nowS = Math.floor(now / 1000)
  if (exp <= nowS) return { ok: false, reason: "expire" }
  if (exp - nowS > MAX_TTL_S) return { ok: false, reason: "invalide" }
  return { ok: true, exp }
}
