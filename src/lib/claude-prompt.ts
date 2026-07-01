// Construction du "prompt dossier" pour Claude Code (CLAUDE.md §6 — bridge).
// Utilisé par /opportunities (bouton Prompt) et DataInsights (copie d'un insight) :
// contexte business live (/api/context) + mission + accès data + livrable/garde-fous.
// Objectif : Claude Code reçoit un dossier auto-suffisant, pas une question nue.

export const PROMPT_FOOTER = `
# ACCÈS DATA
- Supabase via MCP (projet \`uvohlnmwiucedehemxrt\`) : \`data_cache\` (clés \`shopify_orders_<année>_<mois>\`, \`meta_ads_…\`, \`google_ads_…\`, \`klaviyo_flows\`), \`objectives_2026\` (CA HT compta + media, saisis à la main), \`opportunities\`, \`influencer_codes\` / \`influencer_product_sales\` / \`influencer_fixed_fees\` / \`influencer_commissions\` / \`influencer_content\`, \`calendar_events\`, \`knowledge_base\`.
- App prod : https://talika-ecommerce.vercel.app — GET /api/generosite?year=&month=, /api/dashboard/stats, /api/acquisition, /api/objectives, /api/context.
- Repo local : /Users/mac/Talikashopify (app/ = dashboard Next.js, theme/ = thème Shopify) + MCP Shopify/Klaviyo/Meta connectés.

# LIVRABLE ATTENDU
1. Vérifie d'abord les chiffres dans la data réelle (jamais de recommandation sur des chiffres supposés).
2. Analyse chiffrée en TTC (Robin travaille en TTC ; la compta est en HT — préciser la base utilisée).
3. Plan d'action priorisé et concret (quoi, comment, impact estimé) — pas de généralités.
4. Si l'opportunité est traitée, propose de passer son status à "done" (table opportunities).

# GARDE-FOUS
- Ne JAMAIS proposer de réduire l'influence (canal #1, secret sauce du recrutement client).
- Ne pas sommer les ROAS plateformes (attribution double-comptée) — l'arbitre honnête = MER (CA réel ÷ spend réel).
- Ne jamais inventer de claims produit (fiches Shopify + études cliniques réelles uniquement).
- Demander avant tout envoi externe (email, campagne, message).`

export function buildFullPrompt(prompt: string, contextPack: string | null): string {
  if (!contextPack) return prompt
  return [contextPack, "", "---", "", "# MISSION", prompt, PROMPT_FOOTER].join("\n")
}
