/**
 * Base Agent System
 * Each agent runs analysis, generates insights, and can communicate with other agents.
 */

import type { AgentType, AgentInsight, AgentRun } from "@/types"

export interface AgentContext {
  type: AgentType
  previousInsights: AgentInsight[]
  sharedInsights: AgentInsight[] // insights from other agents
  config: AgentConfig
}

export interface AgentConfig {
  enabled: boolean
  schedule: string // cron expression
  maxTokens: number
  temperature: number
  model: string
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  schedule: "0 */4 * * *", // every 4 hours
  maxTokens: 4096,
  temperature: 0.7,
  model: "claude-sonnet-4-20250514",
}

export abstract class BaseAgent {
  protected type: AgentType
  protected config: AgentConfig
  protected run: AgentRun | null = null

  constructor(type: AgentType, config?: Partial<AgentConfig>) {
    this.type = type
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config }
  }

  async execute(context: AgentContext): Promise<AgentInsight[]> {
    this.run = {
      id: crypto.randomUUID(),
      agentType: this.type,
      status: "running",
      startedAt: new Date().toISOString(),
      insightsGenerated: 0,
    }

    try {
      const data = await this.fetchData()
      const analysis = await this.analyze(data, context)
      const insights = await this.generateInsights(analysis, context)

      this.run.status = "completed"
      this.run.completedAt = new Date().toISOString()
      this.run.insightsGenerated = insights.length

      return insights
    } catch (error) {
      this.run.status = "error"
      this.run.error = error instanceof Error ? error.message : "Unknown error"
      throw error
    }
  }

  // Each agent must implement these
  protected abstract fetchData(): Promise<unknown>
  protected abstract analyze(data: unknown, context: AgentContext): Promise<unknown>
  protected abstract generateInsights(
    analysis: unknown,
    context: AgentContext
  ): Promise<AgentInsight[]>

  // Helper to create insight
  protected createInsight(
    params: Omit<AgentInsight, "id" | "agentType" | "createdAt">
  ): AgentInsight {
    return {
      id: crypto.randomUUID(),
      agentType: this.type,
      createdAt: new Date().toISOString(),
      ...params,
    }
  }

  getStatus() {
    return this.run
  }
}

/**
 * Agent Orchestrator
 * Manages agent lifecycle, scheduling, and inter-agent communication
 */
export class AgentOrchestrator {
  private agents: Map<AgentType, BaseAgent> = new Map()
  private insightStore: AgentInsight[] = []
  private runHistory: AgentRun[] = []

  register(agent: BaseAgent, type: AgentType) {
    this.agents.set(type, agent)
  }

  async runAgent(type: AgentType): Promise<AgentInsight[]> {
    const agent = this.agents.get(type)
    if (!agent) throw new Error(`Agent ${type} not registered`)

    const context: AgentContext = {
      type,
      previousInsights: this.insightStore.filter((i) => i.agentType === type),
      sharedInsights: this.insightStore.filter((i) => i.agentType !== type),
      config: DEFAULT_AGENT_CONFIG,
    }

    const insights = await agent.execute(context)
    this.insightStore.push(...insights)

    const status = agent.getStatus()
    if (status) this.runHistory.push(status)

    return insights
  }

  async runAll(): Promise<AgentInsight[]> {
    const allInsights: AgentInsight[] = []
    const types = Array.from(this.agents.keys())
    for (const type of types) {
      try {
        const insights = await this.runAgent(type)
        allInsights.push(...insights)
      } catch (error) {
        console.error(`Agent ${type} failed:`, error)
      }
    }
    return allInsights
  }

  getInsights(type?: AgentType): AgentInsight[] {
    if (type) return this.insightStore.filter((i) => i.agentType === type)
    return this.insightStore
  }

  getRunHistory(): AgentRun[] {
    return this.runHistory
  }
}
