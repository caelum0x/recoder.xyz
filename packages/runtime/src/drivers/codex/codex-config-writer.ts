/**
 * Codex `config.toml` writer — fused from `ts/oh-my-codex/src/config/generator.ts`.
 *
 * The original generator was an OMX-product TOML merger: it parsed an existing
 * `config.toml`, upserted top-level keys (model, reasoning effort, notify hooks),
 * `[features]`/`[env]`/`[agents]`/`[tui]` tables, and a managed block of OMX MCP server
 * `[mcp_servers.*]` tables, while preserving the user's own settings.
 *
 * We keep the load-bearing TOML machinery (root-key parse/strip, marker-bounded managed
 * block, table-key escaping, MCP server table emission) but reshape the OMX-specific
 * surface into what the runtime driver needs:
 *
 *  - upsert `model` + `model_reasoning_effort` at the TOML root (before any [table])
 *  - emit a Recoder-managed block of `[mcp_servers.<name>]` tables from the registry
 *  - preserve every user-authored line outside the managed markers (idempotent re-runs)
 *
 * No notify hooks, no OMX agents/team tables, no Rust sidecar coupling — those belong to
 * the (optional) runtime bridge, not the headless config the CLI reads.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { UnifiedMcpRegistryServer } from './codex-mcp-registry';

const MANAGED_MARKER = 'Recoder runtime managed MCP servers';
const MANAGED_BEGIN = `# === ${MANAGED_MARKER} (begin) ===`;
const MANAGED_END = `# === Recoder runtime managed MCP servers (end) ===`;

const MANAGED_ROOT_KEYS = ['model', 'model_reasoning_effort'] as const;

export type CodexConfigOptions = {
  /** Model to pin at the TOML root (omitted if undefined — passed via --model instead). */
  model?: string;
  /** Reasoning effort knob (`minimal|low|medium|high`). */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  /** MCP servers to expose to codex (already validated by the registry). */
  mcpServers?: readonly UnifiedMcpRegistryServer[];
};

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** A bare TOML table key is used verbatim; anything else is quoted + escaped. */
function toMcpServerTableKey(name: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(name)) {
    return `mcp_servers.${name}`;
  }
  return `mcp_servers."${escapeTomlString(name)}"`;
}

/** Remove the marker-bounded managed block (idempotent re-runs), preserving user lines. */
function stripManagedBlock(config: string): string {
  const lines = config.split(/\r?\n/);
  const begin = lines.findIndex((line) => line.trim() === MANAGED_BEGIN);
  if (begin < 0) return config;
  let end = lines.length;
  for (let i = begin + 1; i < lines.length; i++) {
    if (lines[i].trim() === MANAGED_END) {
      end = i + 1;
      break;
    }
  }
  const before = lines.slice(0, begin);
  // Drop a single trailing blank line we may have inserted before the block.
  if (before.length > 0 && before[before.length - 1].trim() === '') before.pop();
  const after = lines.slice(end);
  return [...before, ...after].join('\n');
}

/**
 * Strip managed root-level keys (those before the first `[table]` header) so we can
 * re-insert them cleanly. User keys inside tables are untouched.
 */
function stripManagedRootKeys(config: string, keys: readonly string[]): string {
  const lines = config.split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[/.test(line));
  const boundary = firstTable >= 0 ? firstTable : lines.length;
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i < boundary) {
      const managed = keys.some((key) => new RegExp(`^\\s*${key}\\s*=`).test(lines[i]));
      if (managed) continue;
    }
    result.push(lines[i]);
  }
  return result.join('\n');
}

/** Build the managed MCP server [table] block (idempotent, marker-bounded). */
function buildManagedMcpBlock(servers: readonly UnifiedMcpRegistryServer[]): string {
  if (servers.length === 0) return '';
  const lines: string[] = [MANAGED_BEGIN];
  for (const server of servers) {
    lines.push(`[${toMcpServerTableKey(server.name)}]`);
    lines.push(`command = "${escapeTomlString(server.command)}"`);
    lines.push(
      `args = [${server.args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ')}]`,
    );
    lines.push(`enabled = ${server.enabled ? 'true' : 'false'}`);
    if (typeof server.startupTimeoutSec === 'number') {
      lines.push(`startup_timeout_sec = ${server.startupTimeoutSec}`);
    }
    lines.push('');
  }
  lines.push(MANAGED_END);
  return lines.join('\n');
}

/**
 * Merge runtime-managed settings into an existing `config.toml` body, preserving the
 * user's own configuration. Pure function (string -> string) for deterministic testing.
 */
export function buildMergedConfig(existingConfig: string, options: CodexConfigOptions): string {
  let existing = stripManagedBlock(existingConfig);
  existing = stripManagedRootKeys(existing, MANAGED_ROOT_KEYS);

  // Compose managed root keys (must appear before any [table] header).
  const rootLines: string[] = [];
  if (options.model) rootLines.push(`model = "${escapeTomlString(options.model)}"`);
  if (options.reasoningEffort) {
    rootLines.push(`model_reasoning_effort = "${options.reasoningEffort}"`);
  }

  const userLines = existing.split(/\r?\n/);
  const firstTable = userLines.findIndex((line) => /^\s*\[/.test(line));
  const head = firstTable >= 0 ? userLines.slice(0, firstTable) : userLines;
  const tail = firstTable >= 0 ? userLines.slice(firstTable) : [];

  const headBlock = [...rootLines, ...head].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  const tailBlock = tail.join('\n').trim();

  const mcpBlock = buildManagedMcpBlock(options.mcpServers ?? []);

  const parts = [headBlock, tailBlock, mcpBlock].filter((part) => part.length > 0);
  return parts.join('\n\n') + '\n';
}

/** Read (if present), merge, and write `config.toml` at `configPath`. */
export async function writeMergedConfig(
  configPath: string,
  options: CodexConfigOptions,
): Promise<{ path: string; wrote: boolean }> {
  const existing = existsSync(configPath) ? await readFile(configPath, 'utf-8') : '';
  const merged = buildMergedConfig(existing, options);
  if (merged === existing) {
    return { path: configPath, wrote: false };
  }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, merged, 'utf-8');
  return { path: configPath, wrote: true };
}

/** Default codex config path under a given codex home. */
export function codexConfigPath(codexHome: string): string {
  return join(codexHome, 'config.toml');
}
