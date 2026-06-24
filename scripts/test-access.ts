// Test de la logique d'accès (fonctions pures de src/lib/roles.ts).
// Lancer : node --experimental-strip-types scripts/test-access.ts
import { isRequestAllowed, navVisible, userSections, homeFor, sectionForPath } from "../src/lib/roles.ts"

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++; else { fail++; console.log(`✗ ${label} → attendu ${JSON.stringify(expected)}, reçu ${JSON.stringify(actual)}`) }
}

// sectionForPath
eq(sectionForPath("/influencers/pipeline"), "influence", "path influence")
eq(sectionForPath("/api/pnl"), "performance", "api pnl → performance")
eq(sectionForPath("/users"), "equipe", "users → equipe")
eq(sectionForPath("/login"), null, "login → null")

// admin : tout
eq(isRequestAllowed("/users", "GET", "admin", undefined), true, "admin /users")
eq(isRequestAllowed("/api/pnl", "POST", "admin", undefined), true, "admin write pnl")
eq(navVisible("/users", "admin", undefined), true, "admin voit equipe")

// member (preset = tout sauf equipe)
eq(isRequestAllowed("/pnl", "GET", "member", undefined), true, "member page pnl")
eq(navVisible("/pnl", "member", undefined), true, "member voit pnl")
eq(navVisible("/users", "member", undefined), false, "member ne voit PAS equipe")
eq(isRequestAllowed("/users", "GET", "member", undefined), false, "member bloqué /users")
eq(isRequestAllowed("/api/users", "POST", "member", undefined), false, "member bloqué api users")

// influence (preset = influence seul)
eq(navVisible("/dashboard", "influence", undefined), false, "influence ne voit pas dashboard")
eq(navVisible("/influencers", "influence", undefined), true, "influence voit influence")
eq(isRequestAllowed("/dashboard", "GET", "influence", undefined), false, "influence bloqué page dashboard")
eq(isRequestAllowed("/api/influencers/codes", "POST", "influence", undefined), true, "influence écrit dans son espace")
eq(isRequestAllowed("/api/pnl", "GET", "influence", undefined), true, "GET ouvert (vue) même hors section")
eq(isRequestAllowed("/api/pnl", "POST", "influence", undefined), false, "influence bloqué écriture pnl")
eq(homeFor("influence", undefined), "/influencers", "home influence")

// override par personne : member custom = dashboard + acquisition seulement
const custom = ["dashboard", "acquisition"]
eq([...userSections("member", custom)].sort(), ["acquisition", "dashboard"], "sections custom")
eq(navVisible("/acquisition", "member", custom), true, "custom voit acquisition")
eq(navVisible("/pnl", "member", custom), false, "custom ne voit pas pnl")
eq(isRequestAllowed("/pnl", "GET", "member", custom), false, "custom bloqué page pnl")
eq(homeFor("member", custom), "/dashboard", "home custom = dashboard")

// equipe jamais octroyable à un sous-rôle même via override
eq(navVisible("/users", "member", ["equipe", "dashboard"]), false, "equipe non octroyable")
eq(userSections("member", ["equipe", "dashboard"]).has("equipe"), false, "equipe filtré de l'override")

console.log(`\n${pass} OK, ${fail} échec(s)`)
process.exit(fail ? 1 : 0)
