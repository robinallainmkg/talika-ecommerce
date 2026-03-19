/**
 * Agent System - Supabase-driven architecture
 *
 * Flow:
 * 1. Dashboard UI creates an agent_run with status='pending' in Supabase
 * 2. Local runner script polls for pending runs
 * 3. Runner spawns a Claude agent (via CLI) with the agent's system prompt + data context
 * 4. Claude agent writes analysis + proposals back to Supabase
 * 5. Dashboard UI displays results and allows approve/reject on proposals
 *
 * NO Anthropic API calls — agents are Claude Code processes run locally.
 */

export const AGENT_DEFINITIONS = {
  traffic: {
    id: "traffic",
    name: "Agent Traffic",
    description: "Analyse le trafic web, les sources, les taux de conversion et les tendances SEO",
    capabilities: ["Analytics", "SEO", "Sources", "Conversion"],
    icon: "Globe",
  },
  sales: {
    id: "sales",
    name: "Agent Ventes",
    description: "Analyse les revenus, AOV, performance produits et segments clients",
    capabilities: ["Revenue", "Produits", "Segments", "AOV"],
    icon: "ShoppingCart",
  },
  meta_ads: {
    id: "meta_ads",
    name: "Agent Meta Ads",
    description: "Optimise les campagnes Meta : budgets, audiences, créas",
    capabilities: ["Campagnes", "ROAS", "Ciblage", "Budgets"],
    icon: "Megaphone",
  },
  klaviyo: {
    id: "klaviyo",
    name: "Agent Klaviyo",
    description: "Analyse les flows email/SMS, performances des campagnes, santé des listes",
    capabilities: ["Flows", "Newsletters", "A/B Tests", "Segments"],
    icon: "Mail",
  },
  communication: {
    id: "communication",
    name: "Agent Communication",
    description: "Planifie le calendrier de communication cross-canal",
    capabilities: ["Planning", "Cross-canal", "Calendrier"],
    icon: "Calendar",
  },
  projects: {
    id: "projects",
    name: "Agent Projets",
    description: "Suit l'avancement des projets, identifie les blocages",
    capabilities: ["Suivi", "Blocages", "Priorités"],
    icon: "Kanban",
  },
  coaching: {
    id: "coaching",
    name: "Agent Coach",
    description: "Méta-agent qui optimise les autres agents et leurs prompts",
    capabilities: ["Optimisation", "Prompts", "Qualité"],
    icon: "Brain",
  },
} as const

export type AgentId = keyof typeof AGENT_DEFINITIONS
