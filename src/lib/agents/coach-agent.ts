import { BaseAgent, type AgentContext } from "./base-agent"
import type { AgentInsight } from "@/types"

/**
 * Coach Agent - Supervises other agents
 * Optimizes prompts, processes, and token consumption
 */
export class CoachAgent extends BaseAgent {
  constructor() {
    super("coach")
  }

  protected async fetchData() {
    // Pull agent run history, token usage, insight quality metrics
    return {
      agentRuns: [
        { type: "traffic", runs: 12, avgTokens: 12500, avgInsights: 3, quality: 0.85 },
        { type: "sales", runs: 12, avgTokens: 15200, avgInsights: 4, quality: 0.92 },
        { type: "ads", runs: 12, avgTokens: 18700, avgInsights: 2, quality: 0.78 },
        { type: "klaviyo", runs: 10, avgTokens: 8900, avgInsights: 5, quality: 0.88 },
      ],
      totalTokens24h: 55300,
      insightActionRate: 0.65, // % of insights that led to actions
    }
  }

  protected async analyze(_data: unknown, _context: AgentContext) {
    return {
      tokenOptimizations: [
        { agent: "ads", suggestion: "Reduce context window by filtering inactive campaigns" },
      ],
      promptImprovements: [
        { agent: "ads", suggestion: "Add benchmark data to improve recommendation quality" },
      ],
      processImprovements: [
        "Schedule traffic + sales agents before ads agent for better cross-referencing",
        "Add feedback loop: track which insights led to actual changes",
      ],
      qualityIssues: [
        { agent: "ads", issue: "Low insight count - may need more granular campaign analysis" },
      ],
    }
  }

  protected async generateInsights(
    _analysis: unknown,
    _context: AgentContext
  ): Promise<AgentInsight[]> {
    return [
      this.createInsight({
        title: "Optimisation tokens Agent Ads",
        description:
          "L'Agent Ads consomme 18.7k tokens/run mais ne génère que 2 insights en moyenne. Réduire le contexte en filtrant les campagnes inactives pourrait économiser 30% des tokens.",
        severity: "info",
        category: "Coach",
        actionable: true,
        suggestedAction:
          "Mettre à jour le prompt de l'Agent Ads pour filtrer les campagnes terminées",
      }),
      this.createInsight({
        title: "Ordre d'exécution sous-optimal",
        description:
          "L'Agent Ads s'exécute avant l'Agent Ventes, ce qui limite les cross-references. En inversant l'ordre, l'Agent Ads pourrait mieux corréler performance ads/ventes.",
        severity: "info",
        category: "Coach",
        actionable: true,
        suggestedAction:
          "Modifier le scheduling : Traffic → Ventes → Ads → Klaviyo",
      }),
    ]
  }
}
