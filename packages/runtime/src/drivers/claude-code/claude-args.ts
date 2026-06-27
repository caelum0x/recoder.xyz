import { ArgBuilder } from '../../drivers/shared/arg-builder';
import type { ClaudePermissionFlags } from './claude-permission-bridge';

/**
 * Build the `claude` CLI argument vector for a headless stream-json run.
 *
 * Base invocation (per design 3.5):
 *   claude -p --output-format stream-json --verbose --input-format stream-json
 *
 * `-p/--print` runs headless (non-interactive). `stream-json` on both input and output gives
 * us a bidirectional JSONL channel: we feed the prompt as a `user` message on stdin and read
 * native events back on stdout. `--verbose` is required by the CLI for streaming output in
 * print mode. Order is stable so recorded fixtures stay deterministic.
 */

export type ClaudeArgsInput = {
  permission: ClaudePermissionFlags;
  /** Path to a written `.mcp.json` for MCP passthrough (absent = no MCP config). */
  mcpConfigPath?: string;
  /** `--resume <sessionId>` for steering continuity (absent = fresh session). */
  resumeSessionId?: string;
  /** `--model <id>` override from brain/route hints (absent = CLI default). */
  model?: string;
  /** Optional extra passthrough flags (kept last; caller owns correctness). */
  extraArgs?: readonly string[];
};

const BASE_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--input-format',
  'stream-json',
] as const;

export function buildClaudeArgs(input: ClaudeArgsInput): string[] {
  const { permission } = input;

  let builder = ArgBuilder.create([...BASE_ARGS]);

  builder = builder.addFlag('--permission-mode', permission.permissionMode);

  if (permission.allowedTools.length > 0) {
    builder = builder.addFlag('--allowedTools', permission.allowedTools.join(','));
  }
  if (permission.disallowedTools.length > 0) {
    builder = builder.addFlag('--disallowedTools', permission.disallowedTools.join(','));
  }

  builder = builder
    .addFlagIf(input.mcpConfigPath !== undefined, '--mcp-config', input.mcpConfigPath)
    .addFlagIf(input.resumeSessionId !== undefined, '--resume', input.resumeSessionId)
    .addFlagIf(input.model !== undefined, '--model', input.model);

  if (input.extraArgs && input.extraArgs.length > 0) {
    builder = builder.add(...input.extraArgs);
  }

  return builder.build();
}
