import { BaseAgent, type AgentContext } from "./base-agent"
import type { AgentInsight } from "@/types"

export class AdsAgent extends BaseAgent {
  constructor() {
    super("ads")
  }

  protected async fetchData() {
    // In production: pull from Meta Ads API
    return {
      campaigns: [
        {
          name: "Lipocils Expert - Printemps",
          spend: 3200,
          roas: 4.2,
          ctr: 2.78,
          conversions: 320,
        },
        {
          name: "Retinol Spring Campaign",
          spend: 2100,
          roas: 1.8,
          ctr: 2.43,
          conversions: 95,
        },
      ],
      accountMetrics: {
        totalSpend: 10700,
        avgROAS: 3.4,
        totalConversions: 878,
      },
    }
  }

  protected async analyze(_data: unknown, _context: AgentContext) {
    return {
      underperforming: ["Retinol Spring Campaign"],
      budgetRecommendations: [
        { campaign: "Retinol Spring", action: "reduce_20pct" },
        { campaign: "Remarketing", action: "increase_15pct" },
      ],
      creativeRecommendations: ["Test UGC format for Retinol"],
      targetingIssues: ["Retinol: age range too broad"],
    }
  }

  protected async generateInsights(
    _analysis: unknown,
    _context: AgentContext
  ): Promise<AgentInsight[]> {
    return [
      this.createInsight({
        title: "ROAS campagne Retinol en dessous du seuil",
        description:
          "La campagne Meta Ads 'Retinol Spring' affiche un ROAS de 1.8x, en dessous de l'objectif de 3x. Le CPC est trop élevé sur le ciblage actuel.",
        severity: "critical",
        category: "Ads",
        actionable: true,
        suggestedAction:
          "Resserrer le ciblage 25-45 ans, tester un nouveau visuel UGC, réduire le budget de 20%",
      }),
    ]
  }
}
