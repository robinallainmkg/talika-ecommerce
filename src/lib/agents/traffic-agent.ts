import { BaseAgent, type AgentContext } from "./base-agent"
import type { AgentInsight } from "@/types"

export class TrafficAgent extends BaseAgent {
  constructor() {
    super("traffic")
  }

  protected async fetchData() {
    // In production: pull from Google Analytics / Shopify analytics
    // For now, return mock structure
    return {
      sessions: { current: 35600, previous: 30800 },
      topSources: [
        { source: "organic", sessions: 12500 },
        { source: "paid_social", sessions: 8200 },
        { source: "direct", sessions: 6100 },
      ],
      bounceRate: { current: 42.3, previous: 45.1 },
      topPages: [
        { path: "/products/lipocils-expert", views: 8500 },
        { path: "/collections/soins-regard", views: 4200 },
        { path: "/", views: 3800 },
      ],
    }
  }

  protected async analyze(_data: unknown, _context: AgentContext) {
    return {
      trends: "traffic_increasing",
      topOpportunity: "organic_instagram",
      risks: ["mobile_bounce_rate_high"],
    }
  }

  protected async generateInsights(
    _analysis: unknown,
    _context: AgentContext
  ): Promise<AgentInsight[]> {
    // In production: Claude generates natural language insights
    return [
      this.createInsight({
        title: "Pic de trafic organique depuis Instagram",
        description:
          "Le trafic organique depuis Instagram a augmenté de 34% cette semaine. Les posts sur le Lipocils Expert génèrent le plus d'engagement.",
        severity: "success",
        category: "Traffic",
        actionable: true,
        suggestedAction:
          "Augmenter la fréquence de posts sur Lipocils Expert et créer un Reel dédié",
      }),
    ]
  }
}
