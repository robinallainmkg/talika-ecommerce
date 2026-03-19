/**
 * Run a single agent run by ID - useful for testing.
 *
 * Usage: npx tsx scripts/run-agent-once.ts <run-id>
 *
 * Environment variables (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { processRun } from "./run-agents";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg: string) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
}

async function main() {
  const runId = process.argv[2];

  if (!runId) {
    console.error("Usage: npx tsx scripts/run-agent-once.ts <run-id>");
    console.error("");
    console.error("Example:");
    console.error(
      "  npx tsx scripts/run-agent-once.ts 550e8400-e29b-41d4-a716-446655440000"
    );
    process.exit(1);
  }

  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    logError(`Invalid run ID format: "${runId}". Expected a UUID.`);
    process.exit(1);
  }

  log(`Processing single run: ${runId}`);

  try {
    await processRun(runId);
    log("Done.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Failed: ${message}`);
    process.exit(1);
  }
}

main();
