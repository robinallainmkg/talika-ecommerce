// Génère un lien de partage en lecture seule qui expire tout seul (cf. src/lib/share-token.ts).
// Usage : CRON_SECRET=… node scripts/gen-share-link.mjs calendar "2026-10-27T23:59:59+01:00" [base_url]
// Le CRON_SECRET doit être celui de l'environnement qui sert la page (Vercel prod pour le lien public).
import { createHmac } from "node:crypto"

const [scope = "calendar", expIso, base = "https://talika-ecommerce.vercel.app"] = process.argv.slice(2)
const secret = process.env.CRON_SECRET
if (!secret) { console.error("CRON_SECRET manquant"); process.exit(1) }
if (!expIso) { console.error("date d'expiration manquante (ISO avec fuseau, ex. 2026-10-27T23:59:59+01:00)"); process.exit(1) }
const exp = Math.floor(new Date(expIso).getTime() / 1000)
if (!Number.isFinite(exp) || exp <= Date.now() / 1000) { console.error("date d'expiration invalide ou passée"); process.exit(1) }
if (exp - Date.now() / 1000 > 7 * 24 * 3600) { console.error("7 jours maximum"); process.exit(1) }

const k = createHmac("sha256", secret).update(`share-link:v1:${scope}`).digest()
const sig = createHmac("sha256", k).update(`${scope}.${exp}`).digest("base64url")
const path = { calendar: "/share/calendar" }[scope]
if (!path) { console.error("scope inconnu :", scope); process.exit(1) }
console.log(`${base.replace(/\/$/, "")}${path}?t=${exp}.${sig}`)
console.error(`expire le ${new Date(exp * 1000).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)`)
