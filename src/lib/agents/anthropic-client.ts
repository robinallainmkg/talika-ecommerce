/**
 * Claude CLI client — runs Claude locally via the CLI tool.
 * NO Anthropic API key needed. Zero cost.
 * Uses async exec to avoid blocking the Node.js event loop.
 */
import { exec } from "child_process"
import { writeFileSync, unlinkSync } from "fs"
import { randomUUID } from "crypto"

export interface ClaudeOptions {
  timeoutMs?: number
}

function execAsync(
  command: string,
  options: { encoding: BufferEncoding; timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv }
): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Claude CLI failed (exit=${error.code}): ${stderr?.slice(0, 300) || error.message}`))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Call Claude via the local CLI (async — does NOT block the server).
 * Writes prompt to a temp file, pipes it to `claude -p --output-format json`.
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const tmpFile = `/tmp/agent-prompt-${randomUUID()}.txt`
  const fullPrompt = `${systemPrompt}\n\n${userMessage}`

  try {
    writeFileSync(tmpFile, fullPrompt, "utf-8")

    const rawOutput = await execAsync(
      `cat "${tmpFile}" | npx -y @anthropic-ai/claude-code -p --output-format json`,
      {
        encoding: "utf-8",
        timeout: options.timeoutMs || 180_000, // 3 min default
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}` } as NodeJS.ProcessEnv,
      }
    )

    // Parse the CLI JSON wrapper
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawOutput)
    } catch {
      return rawOutput
    }

    // Extract the text content from the CLI response
    const responseText =
      (parsed.result as string) ??
      (parsed.content as string) ??
      (parsed.text as string) ??
      rawOutput

    return typeof responseText === "string"
      ? responseText
      : JSON.stringify(responseText)
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      // ignore cleanup
    }
  }
}

export function extractJsonFromResponse(text: string): string {
  // Try markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Try raw JSON object
  const braceStart = text.indexOf("{")
  const braceEnd = text.lastIndexOf("}")
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1)
  }

  return text
}
