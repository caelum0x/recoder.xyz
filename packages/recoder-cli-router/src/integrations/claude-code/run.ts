/**
 * Claude Code integration runner.
 *
 * Spawns the `claude` CLI as a child process and streams its JSON-line output.
 */

import { spawn, execSync } from "child_process"
import type { ClaudeCodeMessage } from "./types"

export interface ClaudeCodeRunResult {
  success?: boolean
  output?: string
  error?: string
  type?: 'system' | 'assistant' | 'result'
  subtype?: 'init' | 'message'
  apiKeySource?: string
  total_cost_usd?: number
  message?: {
    content: Array<{ type: string; text?: string; thinking?: string }>
    stop_reason: string | null
    usage?: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

export interface ClaudeCodeRunOptions {
  systemPrompt: string
  messages: any[]
  path?: string
  modelId: string
  maxOutputTokens?: number
  cacheBreakpoints?: boolean
}

/**
 * Check whether the `claude` CLI binary is reachable.
 */
function isClaudeCliAvailable(): boolean {
  try {
    execSync("command -v claude", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * Extract the last user message text from the messages array.
 * Messages follow the Anthropic format: { role, content } where content
 * can be a string or an array of content blocks.
 */
function extractUserPrompt(messages: any[]): string {
  // Walk backwards to find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        return msg.content
      }
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((block: any) => block.type === "text" && block.text)
          .map((block: any) => block.text)
        if (textParts.length > 0) {
          return textParts.join("\n")
        }
      }
    }
  }
  return ""
}

/**
 * Build the full conversation context as a single prompt string.
 * For multi-turn conversations, we prepend earlier messages as context
 * before the final user message.
 */
function buildConversationPrompt(messages: any[]): string {
  if (messages.length <= 1) {
    return extractUserPrompt(messages)
  }

  const parts: string[] = []

  // Include all messages as context
  for (const msg of messages) {
    const role = msg.role === "user" ? "Human" : "Assistant"
    let text = ""

    if (typeof msg.content === "string") {
      text = msg.content
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((block: any) => block.type === "text" && block.text)
        .map((block: any) => block.text)
        .join("\n")
    }

    if (text) {
      parts.push(`${role}: ${text}`)
    }
  }

  return parts.join("\n\n")
}

/**
 * Spawn the `claude` CLI and yield parsed JSON messages as they arrive.
 *
 * The CLI is invoked with `--print --output-format json` which causes it to
 * emit one JSON object per line to stdout. Each object is a ClaudeCodeMessage
 * (system init, assistant turn, or final result).
 */
export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<string | ClaudeCodeMessage> {
  // 1. Check CLI availability
  if (!isClaudeCliAvailable()) {
    yield "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    return {
      success: false,
      error: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
      type: 'system' as const,
    } satisfies ClaudeCodeRunResult
  }

  // 2. Build CLI arguments
  const args: string[] = [
    "--print",
    "--output-format", "json",
  ]

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt)
  }

  if (options.modelId) {
    args.push("--model", options.modelId)
  }

  if (options.maxOutputTokens !== undefined) {
    args.push("--max-tokens", String(options.maxOutputTokens))
  }

  // The conversation prompt is the final positional argument
  const prompt = buildConversationPrompt(options.messages)
  args.push(prompt)

  // 3. Spawn the process
  const spawnOptions: { cwd?: string; env: NodeJS.ProcessEnv } = {
    env: { ...process.env },
  }

  if (options.path) {
    spawnOptions.cwd = options.path
  }

  const child = spawn("claude", args, spawnOptions)

  // 4. Stream stdout line-by-line, parsing JSON
  // We accumulate partial lines since data chunks may not align to line boundaries.
  let buffer = ""
  let fullOutput = ""

  const stdoutIterator = createLineIterator(child.stdout, () => buffer, (b: string) => { buffer = b })
  const stderrChunks: string[] = []

  // Collect stderr for error reporting
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString("utf-8"))
  })

  // Create a promise that resolves when the process exits
  const exitPromise = new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code))
    child.on("error", () => resolve(null))
  })

  // Process stdout lines
  for await (const line of stdoutIterator) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Try to parse as JSON (Claude CLI --output-format json emits JSON lines)
    try {
      const parsed = JSON.parse(trimmed) as ClaudeCodeMessage
      fullOutput += trimmed + "\n"
      yield parsed
    } catch {
      // Not valid JSON -- yield as plain text (e.g. progress messages)
      fullOutput += trimmed + "\n"
      yield trimmed
    }
  }

  // Wait for process to exit
  const exitCode = await exitPromise

  // If the process exited with an error and we haven't yielded meaningful output
  if (exitCode !== 0 && exitCode !== null) {
    const stderrText = stderrChunks.join("").trim()
    const errorMsg = stderrText || `Claude CLI exited with code ${exitCode}`

    if (!fullOutput.trim()) {
      yield errorMsg
    }

    return {
      success: false,
      error: errorMsg,
      type: 'result' as const,
    } satisfies ClaudeCodeRunResult
  }

  return {
    success: true,
    output: fullOutput,
    type: 'result' as const,
  } satisfies ClaudeCodeRunResult
}

/**
 * Async generator that yields complete lines from a readable stream.
 * Handles partial lines that span multiple data chunks.
 */
async function* createLineIterator(
  stream: NodeJS.ReadableStream | null,
  getBuffer: () => string,
  setBuffer: (b: string) => void,
): AsyncGenerator<string> {
  if (!stream) return

  for await (const chunk of stream) {
    const data = getBuffer() + chunk.toString("utf-8")
    const lines = data.split("\n")

    // The last element may be an incomplete line
    setBuffer(lines.pop() || "")

    for (const line of lines) {
      yield line
    }
  }

  // Flush any remaining data in the buffer
  const remaining = getBuffer()
  if (remaining) {
    setBuffer("")
    yield remaining
  }
}
