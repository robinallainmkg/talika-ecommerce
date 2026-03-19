import { BaseAgent, type AgentContext } from "./base-agent"
import type { AgentInsight } from "@/types"

export class KlaviyoAgent extends BaseAgent {
  constructor() {
    super("klaviyo")
  }

  protected async fetchData() {
    // In production: pull from Klaviyo API
    return {
      flows: [
        { name: "Welcome Series", openRate: 52.3, clickRate: 8.2, revenue: 12400 },
        { name: "Abandon de panier", openRate: 38.1, clickRate: 4.5, revenue: 28600 },
        { name: "Post-achat", openRate: 45.2, clickRate: 6.1, revenue: 8200 },
      ],
      newsletters: [
        { subject: "Offre Printemps", openRate: 35.2, clickRate: 6.8, revenue: 15200 },
      ],
      missingFlows: ["post-purchase-cross-sell", "birthday", "sunset"],
      listGrowth: { current: 45000, previous: 43500 },
    }
  }

  protected async analyze(_data: unknown, _context: AgentContext) {
    return {
      flowsToOptimize: ["abandon_panier"],
      newFlowSuggestions: ["post-achat cross-sell contour des yeux"],
      abTestSuggestions: ["subject line abandon panier email 2"],
      newsletterThemes: ["routine printemps", "behind the scenes", "UGC spotlight"],
      contentRefreshNeeded: ["Welcome Series - email 3"],
    }
  }

  protected async generateInsights(
    _analysis: unknown,
    _context: AgentContext
  ): Promise<AgentInsight[]> {
    return [
      this.createInsight({
        title: "Flow abandon de panier sous-performe",
        description:
          "Le flow d'abandon de panier a un taux d'ouverture de 38% (vs 45% industrie). Le 2ème email du flow a un taux de clic très bas (1.2%).",
        severity: "warning",
        category: "Email",
        actionable: true,
        suggestedAction:
          "A/B test sujet du 2ème email, ajouter un code promo -10% dans le 3ème email",
      }),
      this.createInsight({
        title: "Opportunité : Flow post-achat manquant",
        description:
          "Aucun flow de cross-sell post-achat n'est configuré. Les clients qui achètent Lipocils ont 40% de chance d'acheter un soin contour des yeux.",
        severity: "info",
        category: "Email",
        actionable: true,
        suggestedAction:
          "Créer un flow post-achat J+7 avec recommandation contour des yeux",
      }),
    ]
  }
}
