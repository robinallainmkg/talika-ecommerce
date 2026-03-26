import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { callClaude, extractJsonFromResponse } from "@/lib/agents/anthropic-client"
import { gatherContext } from "@/lib/agents/context-gatherers"
import { getSystemPrompt } from "@/lib/agents/system-prompts"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Proposal {
  title: string
  description: string
  category: string
  priority: string
  severity?: string
}

interface AgentResponse {
  analysis: string
  proposals: Proposal[]
}

// Uses Claude CLI locally — zero API cost
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { agentId, pageContext } = body

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 })
    }

    // 1. Fetch agent config
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single()

    if (!agent) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 })
    }

    // 2. Create agent_run record
    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        agent_id: agentId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    // 3. Gather context from Supabase
    const contextData = await gatherContext(supabase, agentId)

    // Trim context if too large (keep under 50KB for CLI prompt)
    const contextStr = JSON.stringify(contextData)
    if (contextStr.length > 50_000) {
      for (const key of Object.keys(contextData)) {
        const val = JSON.stringify(contextData[key])
        if (val.length > 10_000) {
          contextData[key] = `[Trimmed: ${val.length} chars]`
        }
      }
    }

    // 4. Build prompt and call Claude CLI (local, free)
    const systemPrompt = getSystemPrompt(agentId, agent.system_prompt)

    const userPrompt = `Voici les données à analyser :

${JSON.stringify(contextData, null, 2)}

Analyse ces données et génère des insights actionnables.
Réponds UNIQUEMENT avec du JSON valide (pas de markdown, pas de code fences). Utilise ce schema :

{
  "analysis": "Un résumé concis de ton analyse (2-4 paragraphes en français).",
  "proposals": [
    {
      "title": "Titre court",
      "description": "Description détaillée de l'insight ou recommandation",
      "category": "performance | optimization | alert | opportunity | risk",
      "priority": "low | medium | high | critical",
      "severity": "info | warning | success | critical"
    }
  ]
}

Génère entre 2 et 6 proposals. Sois spécifique et concret avec les chiffres.`

    const response = await callClaude(systemPrompt, userPrompt, {
      timeoutMs: 180_000,
    })

    // 5. Parse response
    const jsonStr = extractJsonFromResponse(response)
    let parsed: AgentResponse

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      parsed = {
        analysis: response,
        proposals: [{
          title: "Analyse disponible",
          description: response.slice(0, 500),
          category: "performance",
          priority: "medium",
          severity: "info",
        }],
      }
    }

    // 6. Store proposals in Supabase
    const proposalRows = (parsed.proposals || []).map((p) => ({
      agent_id: agentId,
      run_id: run?.id || null,
      title: p.title,
      description: p.description,
      category: p.category,
      priority: p.priority,
      status: "pending",
      page_context: pageContext || agentId,
    }))

    if (proposalRows.length > 0) {
      await supabase.from("agent_proposals").insert(proposalRows)
    }

    // 7. Update run status
    if (run?.id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          insights_generated: proposalRows.length,
        })
        .eq("id", run.id)
    }

    return NextResponse.json({
      success: true,
      runId: run?.id,
      analysis: parsed.analysis,
      proposals: parsed.proposals,
      proposalsStored: proposalRows.length,
    })
  } catch (error) {
    console.error("Agent inline run error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent execution failed" },
      { status: 500 }
    )
  }
}
