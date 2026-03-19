import { BaseAgent, type AgentContext } from "./base-agent"
import type { AgentInsight } from "@/types"

export class SalesAgent extends BaseAgent {
  constructor() {
    super("sales")
  }

  protected async fetchData() {
    // In production: pull from Shopify orders API
    return {
      revenue: { current: 102000, previous: 88000 },
      orders: { current: 1450, previous: 1280 },
      aov: { current: 70.3, previous: 68.7 },
      topProducts: [
        { name: "Lipocils Expert", revenue: 45200, units: 1120, conversion: 4.2 },
        { name: "Eyebrow Lipocil", revenue: 28300, units: 780, conversion: 3.8 },
      ],
      bundles: [
        { name: "Lipocils + Eyebrow", conversion: 8.4 },
      ],
      segments: {
        new: 1200,
        returning: 680,
        vip: 180,
        inactive: 2400,
      },
    }
  }

  protected async analyze(_data: unknown, _context: AgentContext) {
    return {
      revenueGrowth: 15.9,
      topPerformer: "Lipocils Expert",
      bundleOpportunity: true,
      mobileConversionDrop: true,
      crossSellOpportunities: ["contour des yeux après Lipocils"],
    }
  }

  protected async generateInsights(
    _analysis: unknown,
    _context: AgentContext
  ): Promise<AgentInsight[]> {
    return [
      this.createInsight({
        title: "Top produit : Lipocils Expert",
        description:
          "Lipocils Expert représente 35% du CA ce mois. Le bundle Lipocils + Eyebrow Lipocil convertit 2x mieux que le produit seul.",
        severity: "info",
        category: "Ventes",
        actionable: true,
        suggestedAction:
          "Mettre en avant le bundle sur la homepage et dans les campagnes Meta",
      }),
      this.createInsight({
        title: "Baisse de conversion sur mobile",
        description:
          "Le taux de conversion mobile est passé de 2.1% à 1.6% cette semaine. La page produit Lipocils Expert met 4.2s à charger sur mobile.",
        severity: "warning",
        category: "Ventes",
        actionable: true,
        suggestedAction:
          "Optimiser les images produit et réduire le poids de la page",
      }),
    ]
  }
}
