/**
 * Codex MCP registry — fused from `ts/oh-my-codex/src/config/mcp-registry.ts`.
 *
 * Faithful merge: the original loaded a unified MCP registry from
 * `~/.omx/mcp-registry.json` (and `~/.omc/...`) and validated each entry. We keep the
 * loader + validation intact, and expose `mcpServersToTomlBlock()` (the codex-config-writer
 * uses it) plus a host-injection entrypoint `mcpServersFromHostConfig()` so the runtime's
 * `seams/mcp-port.ts` can hand servers in directly (instead of only reading from disk).
 *
 * Validation is load-bearing: a malformed registry entry is skipped with a warning, never
 * silently trusted (per the repo "never trust external data" rule).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type UnifiedMcpRegistryServer = {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  startupTimeoutSec?: number;
};

export type UnifiedMcpRegistryLoadResult = {
  servers: UnifiedMcpRegistryServer[];
  sourcePath?: string;
  warnings: string[];
};

export type LoadUnifiedMcpRegistryOptions = {
  candidates?: string[];
  homeDir?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTimeout(value: unknown, name: string, warnings: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    warnings.push(`registry entry "${name}" has invalid timeout; ignoring timeout`);
    return undefined;
  }
  return Math.floor(value);
}

function normalizeEntry(
  name: string,
  value: unknown,
  warnings: string[],
): UnifiedMcpRegistryServer | null {
  if (!isRecord(value)) {
    warnings.push(`registry entry "${name}" is not an object; skipping`);
    return null;
  }

  const command = value['command'];
  if (typeof command !== 'string' || command.trim().length === 0) {
    warnings.push(`registry entry "${name}" is missing command; skipping`);
    return null;
  }

  const argsValue = value['args'];
  if (
    argsValue !== undefined &&
    (!Array.isArray(argsValue) || argsValue.some((item) => typeof item !== 'string'))
  ) {
    warnings.push(`registry entry "${name}" has non-string args; skipping`);
    return null;
  }

  const enabledValue = value['enabled'];
  if (enabledValue !== undefined && typeof enabledValue !== 'boolean') {
    warnings.push(`registry entry "${name}" has non-boolean enabled; skipping`);
    return null;
  }

  const timeoutCandidate =
    value['timeout'] ?? value['startup_timeout_sec'] ?? value['startupTimeoutSec'];

  return {
    name,
    command,
    args: (argsValue as string[] | undefined) ?? [],
    enabled: enabledValue ?? true,
    startupTimeoutSec: normalizeTimeout(timeoutCandidate, name, warnings),
  };
}

export function getUnifiedMcpRegistryCandidates(homeDir = homedir()): string[] {
  return [
    join(homeDir, '.omx', 'mcp-registry.json'),
    join(homeDir, '.omc', 'mcp-registry.json'),
  ];
}

export async function loadUnifiedMcpRegistry(
  options: LoadUnifiedMcpRegistryOptions = {},
): Promise<UnifiedMcpRegistryLoadResult> {
  const candidates = options.candidates ?? getUnifiedMcpRegistryCandidates(options.homeDir);
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    return { servers: [], warnings: [] };
  }

  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(sourcePath, 'utf-8'));
  } catch (error) {
    warnings.push(`failed to parse shared MCP registry at ${sourcePath}: ${String(error)}`);
    return { servers: [], sourcePath, warnings };
  }

  if (!isRecord(parsed)) {
    warnings.push(`shared MCP registry at ${sourcePath} must be a JSON object`);
    return { servers: [], sourcePath, warnings };
  }

  const servers: UnifiedMcpRegistryServer[] = [];
  for (const [name, value] of Object.entries(parsed)) {
    const normalized = normalizeEntry(name, value, warnings);
    if (!normalized) continue;
    servers.push(normalized);
  }

  return { servers, sourcePath, warnings };
}

/**
 * Normalize MCP servers handed in by the host (via `seams/mcp-port.ts`) into the same
 * validated shape, so disk-loaded and host-injected servers are interchangeable.
 */
export function mcpServersFromHostConfig(input: unknown): UnifiedMcpRegistryLoadResult {
  if (!isRecord(input)) {
    return { servers: [], warnings: input === undefined ? [] : ['host MCP config must be an object'] };
  }
  const warnings: string[] = [];
  const servers: UnifiedMcpRegistryServer[] = [];
  for (const [name, value] of Object.entries(input)) {
    const normalized = normalizeEntry(name, value, warnings);
    if (normalized) servers.push(normalized);
  }
  return { servers, warnings };
}
