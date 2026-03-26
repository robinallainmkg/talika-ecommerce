/**
 * Agent Runner - Polls for pending agent runs and processes them via Claude CLI.
 *
 * Usage: npx tsx scripts/run-agents.ts
 *
 * Environment variables (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg: string) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
}

// ---------------------------------------------------------------------------
// Load .env.local (lightweight, no dotenv dependency)
// ---------------------------------------------------------------------------

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "..", ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional if env vars are already set
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentRunRow {
  id: string;
  agent_id: string;
  status: string;
  input_data: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  output_data: Record<string, unknown> | null;
  error: string | null;
  insights_generated: number | null;
  created_at: string;
}

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  system_prompt: string | null;
  config: Record<string, unknown> | null;
}

interface Proposal {
  title: string;
  description: string;
  category: string;
  priority: string;
}

interface ClaudeResponse {
  analysis: string;
  proposals: Proposal[];
}

// ---------------------------------------------------------------------------
// Context gathering
// ---------------------------------------------------------------------------

async function gatherContext(
  agentId: string
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {};

  // Recent metrics snapshots (last 30 days worth)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: metrics } = await supabase
    .from("metrics_snapshots")
    .select("*")
    .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
    .order("date", { ascending: false })
    .limit(50);
  context.recent_metrics = metrics ?? [];

  // Recent proposals for this agent (to avoid duplicate suggestions)
  const { data: recentProposals } = await supabase
    .from("agent_proposals")
    .select("title, description, category, priority, status, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(20);
  context.recent_proposals = recentProposals ?? [];

  // Agent-type-specific context
  switch (agentId) {
    case "sales":
    case "traffic": {
      const { data: pnl } = await supabase
        .from("pnl_entries")
        .select("*, pnl_categories(*)")
        .order("date", { ascending: false })
        .limit(30);
      context.pnl_data = pnl ?? [];

      // Also fetch cached Shopify data for real analytics
      const { data: shopifyAnalytics } = await supabase
        .from("data_cache")
        .select("key, data")
        .eq("source", "shopify");
      if (shopifyAnalytics) {
        for (const entry of shopifyAnalytics) {
          if (entry.key.startsWith("shopify_analytics")) {
            context.shopify_analytics = entry.data;
          } else if (entry.key.startsWith("shopify_orders")) {
            // Send summary, not full orders (too large for prompt)
            const orders = (entry.data as any)?.orders || [];
            context.shopify_orders_summary = {
              count: orders.length,
              total_revenue: orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0),
              avg_order_value: orders.length ? orders.reduce((s: number, o: any) => s + parseFloat(o.total_price || "0"), 0) / orders.length : 0,
              top_discount_codes: Array.from(new Set(orders.flatMap((o: any) => (o.discount_codes || []).map((d: any) => d.code)))).slice(0, 20),
              fulfillment_statuses: orders.reduce((acc: any, o: any) => { acc[o.fulfillment_status || "unfulfilled"] = (acc[o.fulfillment_status || "unfulfilled"] || 0) + 1; return acc; }, {}),
              financial_statuses: orders.reduce((acc: any, o: any) => { acc[o.financial_status || "unknown"] = (acc[o.financial_status || "unknown"] || 0) + 1; return acc; }, {}),
            };
          } else if (entry.key === "shopify_products") {
            const products = (entry.data as any)?.products || [];
            context.shopify_products_summary = {
              count: products.length,
              by_status: products.reduce((acc: any, p: any) => { acc[p.status || "unknown"] = (acc[p.status || "unknown"] || 0) + 1; return acc; }, {}),
              product_types: Array.from(new Set(products.map((p: any) => p.product_type).filter(Boolean))),
            };
          }
        }
      }
      break;
    }
    case "meta_ads": {
      const { data: pnl } = await supabase
        .from("pnl_entries")
        .select("*, pnl_categories(*)")
        .order("date", { ascending: false })
        .limit(30);
      context.ads_pnl = pnl ?? [];
      break;
    }
    case "klaviyo": {
      const { data: metricsKlaviyo } = await supabase
        .from("metrics_snapshots")
        .select("*")
        .eq("source", "klaviyo")
        .order("date", { ascending: false })
        .limit(20);
      context.klaviyo_metrics = metricsKlaviyo ?? [];
      break;
    }
    case "communication": {
      const { data: events } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(30);
      context.upcoming_events = events ?? [];
      break;
    }
    case "projects": {
      const { data: projects } = await supabase
        .from("projects")
        .select("*, project_tasks(*)")
        .in("status", ["in_progress", "not_started"]);
      context.active_projects = projects ?? [];
      break;
    }
    case "coaching": {
      // Coach gets a broad view
      const { data: pnl } = await supabase
        .from("pnl_entries")
        .select("*, pnl_categories(*)")
        .order("date", { ascending: false })
        .limit(30);
      context.pnl_data = pnl ?? [];

      const { data: projects } = await supabase
        .from("projects")
        .select("name, status, progress")
        .in("status", ["in_progress", "not_started"]);
      context.projects_summary = projects ?? [];

      const { data: recentRuns } = await supabase
        .from("agent_runs")
        .select("agent_id, status, completed_at, insights_generated")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(20);
      context.recent_agent_runs = recentRuns ?? [];
      break;
    }
  }

  return context;
}

// ---------------------------------------------------------------------------
// Build the prompt for Claude CLI
// ---------------------------------------------------------------------------

function buildPrompt(
  agent: AgentRow,
  run: AgentRunRow,
  contextData: Record<string, unknown>
): string {
  const systemPrompt =
    agent.system_prompt ??
    `You are the "${agent.id}" agent for Talika, a French cosmetics e-commerce brand. Analyze the provided data and generate actionable insights.`;

  const inputData = run.input_data ?? {};

  return `${systemPrompt}

== INPUT DATA ==
${JSON.stringify(inputData, null, 2)}

== CONTEXT DATA ==
${JSON.stringify(contextData, null, 2)}

== INSTRUCTIONS ==
Analyze the above data for the "${agent.id}" domain.
Respond ONLY with valid JSON (no markdown, no code fences). Use this exact schema:

{
  "analysis": "A concise summary of your analysis (1-3 paragraphs in French).",
  "proposals": [
    {
      "title": "Short title",
      "description": "Detailed description of the insight or recommendation",
      "category": "One of: performance, optimization, alert, opportunity, risk",
      "priority": "One of: low, medium, high, critical"
    }
  ]
}

Generate between 1 and 5 proposals. Focus on actionable, specific insights.`;
}

// ---------------------------------------------------------------------------
// Process a single agent run
// ---------------------------------------------------------------------------

export async function processRun(runId: string): Promise<void> {
  log(`Processing run ${runId}`);

  // Fetch the run
  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .single<AgentRunRow>();

  if (runError || !run) {
    logError(`Failed to fetch run ${runId}: ${runError?.message}`);
    return;
  }

  // Mark as running
  await supabase
    .from("agent_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  try {
    // Fetch agent config from the agents table
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", run.agent_id)
      .single<AgentRow>();

    if (agentError || !agent) {
      throw new Error(
        `No agent found for agent_id="${run.agent_id}": ${agentError?.message}`
      );
    }

    // Gather context data
    log(`Gathering context for agent "${agent.id}" (${agent.name})`);
    const contextData = await gatherContext(agent.id);

    // Trim context to avoid "prompt too long" errors (max ~50KB of JSON)
    const contextStr = JSON.stringify(contextData);
    if (contextStr.length > 50_000) {
      log(`Context too large (${contextStr.length} chars), trimming...`);
      // Keep only summary keys, drop large arrays
      for (const key of Object.keys(contextData)) {
        const val = JSON.stringify(contextData[key]);
        if (val.length > 10_000) {
          contextData[key] = `[Trimmed: ${val.length} chars - too large for prompt]`;
        }
      }
    }

    // Build the prompt
    const prompt = buildPrompt(agent, run, contextData);

    // Write prompt to a temp file to avoid shell escaping issues
    const tmpFile = `/tmp/agent-prompt-${runId}.txt`;
    const { writeFileSync, unlinkSync } = await import("fs");
    writeFileSync(tmpFile, prompt, "utf-8");

    // Spawn Claude CLI
    log(`Spawning Claude CLI for run ${runId} (agent="${agent.id}")`);
    let rawOutput: string;
    try {
      rawOutput = execSync(
        `cat "${tmpFile}" | npx -y @anthropic-ai/claude-code -p --output-format json`,
        {
          encoding: "utf-8",
          timeout: 180_000, // 3 minute timeout
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}` },
        }
      );
    } catch (cliError: unknown) {
      const err = cliError as { stderr?: string; stdout?: string; message?: string; status?: number };
      throw new Error(`Claude CLI failed (exit=${err.status}): stderr=${err.stderr?.slice(0, 500)} stdout=${err.stdout?.slice(0, 500)} msg=${err.message?.slice(0, 200)}`);
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }

    // Parse the Claude CLI JSON wrapper response
    log(`Parsing Claude CLI response for run ${runId}`);
    let claudeOutput: Record<string, unknown>;
    try {
      claudeOutput = JSON.parse(rawOutput);
    } catch {
      throw new Error(
        `Failed to parse Claude CLI JSON output: ${rawOutput.slice(0, 500)}`
      );
    }

    // The CLI --output-format json wraps the response; extract the text content
    const responseText =
      (claudeOutput.result as string) ??
      (claudeOutput.content as string) ??
      (claudeOutput.text as string) ??
      rawOutput;

    // Extract the actual JSON from the response text (handle potential markdown fences)
    const jsonStr = extractJson(
      typeof responseText === "string"
        ? responseText
        : JSON.stringify(responseText)
    );

    let parsed: ClaudeResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(
        `Failed to parse agent response as JSON: ${jsonStr.slice(0, 500)}`
      );
    }

    // Validate structure
    if (!parsed.analysis || !Array.isArray(parsed.proposals)) {
      throw new Error(
        `Invalid response structure. Expected { analysis, proposals[] }, got keys: ${Object.keys(parsed).join(", ")}`
      );
    }

    // Write proposals to agent_proposals
    const proposalRows = parsed.proposals.map((p) => ({
      agent_id: run.agent_id,
      run_id: runId,
      title: p.title,
      description: p.description,
      category: p.category,
      priority: p.priority,
      status: "pending",
    }));

    if (proposalRows.length > 0) {
      const { error: insertError } = await supabase
        .from("agent_proposals")
        .insert(proposalRows);

      if (insertError) {
        logError(`Failed to insert proposals: ${insertError.message}`);
      } else {
        log(`Inserted ${proposalRows.length} proposals for run ${runId}`);
      }
    }

    // Mark run as completed
    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        analysis: parsed.analysis,
        tokens_used: null,
      })
      .eq("id", runId);

    log(
      `Run ${runId} completed successfully (${proposalRows.length} proposals)`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Run ${runId} failed: ${message}`);

    await supabase
      .from("agent_runs")
      .update({
        status: "error",
        completed_at: new Date().toISOString(),
        error: message.slice(0, 2000),
      })
      .eq("id", runId);
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  // Try to find JSON in markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find a top-level JSON object
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }

  return text;
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
let shutdownRequested = false;

async function pollOnce(): Promise<number> {
  const { data: pendingRuns, error } = await supabase
    .from("agent_runs")
    .select("id, agent_id, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    logError(`Failed to poll agent_runs: ${error.message}`);
    return 0;
  }

  if (!pendingRuns || pendingRuns.length === 0) {
    return 0;
  }

  log(`Found ${pendingRuns.length} pending run(s)`);

  for (const run of pendingRuns) {
    if (shutdownRequested) break;
    await processRun(run.id);
  }

  return pendingRuns.length;
}

async function main() {
  log("Agent runner started. Polling every 5 seconds...");
  log(`Supabase URL: ${SUPABASE_URL}`);

  while (!shutdownRequested) {
    try {
      await pollOnce();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logError(`Poll cycle error: ${message}`);
    }

    if (!shutdownRequested) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  log("Agent runner shut down gracefully.");
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on("SIGINT", () => {
  log("Received SIGINT, shutting down after current run...");
  shutdownRequested = true;
});

process.on("SIGTERM", () => {
  log("Received SIGTERM, shutting down after current run...");
  shutdownRequested = true;
});

// ---------------------------------------------------------------------------
// Entry point - only run the polling loop when executed directly
// ---------------------------------------------------------------------------

const isDirectExecution =
  process.argv[1]?.endsWith("run-agents.ts") ||
  process.argv[1]?.endsWith("run-agents");

if (isDirectExecution) {
  main().catch((err) => {
    logError(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
