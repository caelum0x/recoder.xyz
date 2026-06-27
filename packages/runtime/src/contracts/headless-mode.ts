/**
 * The headless invocation mode a driver uses to drive its underlying CLI/agent.
 *
 * - `print`      one-shot print/text output (e.g. claude `-p`, opencode `run`)
 * - `json`       structured JSON / stream-json output (e.g. claude stream-json, codex `exec --json`)
 * - `rpc`        bidirectional JSONL RPC over stdio (pi rpc-mode steering/abort/compaction)
 * - `acp`        Agent Client Protocol (newline-framed JSON-RPC over stdio)
 * - `exec`       remote/local exec stream of stdout/stderr (sandbox exec)
 * - `in_process` no child process; the agent runs in-process (pi print-mode, ToolLoopAgent)
 */
export type HeadlessMode = 'print' | 'json' | 'rpc' | 'acp' | 'exec' | 'in_process';

export const HEADLESS_MODES: readonly HeadlessMode[] = [
  'print',
  'json',
  'rpc',
  'acp',
  'exec',
  'in_process',
] as const;

export function isHeadlessMode(value: string): value is HeadlessMode {
  return (HEADLESS_MODES as readonly string[]).includes(value);
}
