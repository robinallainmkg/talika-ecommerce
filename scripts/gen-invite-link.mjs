import { readFileSync } from "node:fs"

// Charge .env.local manuellement (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
const env = {}
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const AUTH = `${SUPABASE_URL}/auth/v1`
const SITE_URL = "https://talika-ecommerce.vercel.app"
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }

const EMAIL = (process.argv[2] || "a.saglio@talika.com").toLowerCase()
const ROLE = process.argv[3] || "member"

// 1. Chercher le compte existant
const list = await fetch(`${AUTH}/admin/users?per_page=200`, { headers: H }).then((r) => r.json())
const existing = (list.users || []).find((u) => u.email === EMAIL)

if (existing) {
  console.log(`Compte existant: id=${existing.id}`)
  console.log(`  last_sign_in_at = ${existing.last_sign_in_at || "(jamais → en attente)"}`)
  console.log(`  email_confirmed_at = ${existing.email_confirmed_at || "(non)"}`)
  if (existing.last_sign_in_at) {
    console.log("\n⚠️  Ce compte est DÉJÀ ACTIF (elle s'est déjà connectée). Pas besoin de lien.")
    process.exit(0)
  }
  // En attente → on supprime pour régénérer un lien frais (même logique que /api/users)
  await fetch(`${AUTH}/admin/users/${existing.id}`, { method: "DELETE", headers: H })
  console.log("  → compte en attente supprimé, régénération d'un lien frais…")
}

// 2. Générer le lien d'invitation (sans envoi d'email)
const res = await fetch(`${AUTH}/admin/generate_link`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ type: "invite", email: EMAIL, data: { role: ROLE, invited_by: "robin" } }),
})
const data = await res.json()
if (!res.ok || !data.hashed_token) {
  console.error("ERREUR:", JSON.stringify(data, null, 2))
  process.exit(1)
}

const link = `${SITE_URL}/auth/set-password?token_hash=${data.hashed_token}&type=invite`
console.log(`\n✅ LIEN D'ACTIVATION pour ${EMAIL} (rôle: ${ROLE}, valable 24 h) :\n`)
console.log(link)
console.log("\n→ Copie ce lien et envoie-le-lui (Slack / mail perso). À ouvrir dans un navigateur normal (pas via un scanner Outlook).")
