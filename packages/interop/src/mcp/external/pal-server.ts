import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExternalMcpServerConfig } from "./external-server-config";

/**
 * Registers the REAL cloned Python `py/pal-mcp-server` (PAL MCP Server v9.8.2) as
 * a supervised external stdio MCP server.
 *
 * This is NOT a REST wrapper and NOT a transpile. The Python server speaks stdio
 * JSON-RPC MCP (see `py/pal-mcp-server/server.py`: `stdio_server()` + the `TOOLS`
 * registry). We host its process behind `StdioMcpClient` with the same
 * authorize→risk→policy→audit gate every server gets. Its self-advertised tool
 * catalog is still untrusted and runs through the catalog validator; only the
 * names in {@link PAL_TOOL_NAMES} below are permitted to be exposed.
 *
 * Degrade-safe: if the python venv (`.pal_venv/bin/python`) is absent we DO NOT
 * fake readiness. {@link buildPalServerConfig} still returns a well-formed config
 * (so the registry/health surface shows it), and {@link palServerAvailability}
 * reports the truthful reason it is unavailable.
 */

/**
 * The 18 tools the PAL server exposes, verified from `server.py`'s `TOOLS`
 * registry. This is the TRUSTED allowlist — the running server's advertised
 * catalog is intersected with this set, so it can never widen its surface.
 */
export const PAL_TOOL_NAMES = [
  "chat",
  "thinkdeep",
  "planner",
  "consensus",
  "codereview",
  "precommit",
  "debug",
  "secaudit",
  "docgen",
  "analyze",
  "refactor",
  "tracer",
  "testgen",
  "challenge",
  "apilookup",
  "clink",
  "listmodels",
  "version",
] as const;

/** The default server id for the PAL external MCP server. */
export const PAL_SERVER_ID = "pal-mcp-server";

export interface PalServerOptions {
  /** Absolute path to the cloned `py/pal-mcp-server` directory. */
  readonly rootDir: string;
  /** Override the python executable (defaults to the repo venv python). */
  readonly pythonPath?: string;
  /** Idle TTL ms (default 5 min). */
  readonly idleTtlMs?: number;
  /** Startup handshake timeout ms (default 20s — python cold start is slow). */
  readonly startupTimeoutMs?: number;
  /** Env overlay (e.g. provider API keys). Never hardcoded; injected by caller. */
  readonly env?: Readonly<Record<string, string>>;
}

/** The venv python path the PAL run-server.sh uses (`.pal_venv`). */
export function defaultPalPythonPath(rootDir: string): string {
  return join(rootDir, ".pal_venv", "bin", "python");
}

/**
 * Build the trusted external-server config for the PAL server. The config is
 * well-formed regardless of whether the python env exists — availability is a
 * separate, truthful check ({@link palServerAvailability}).
 */
export function buildPalServerConfig(
  options: PalServerOptions,
): ExternalMcpServerConfig {
  const pythonPath = options.pythonPath ?? defaultPalPythonPath(options.rootDir);
  return {
    serverId: PAL_SERVER_ID,
    kind: "custom",
    displayName: "PAL MCP Server (py/pal-mcp-server)",
    command: pythonPath,
    args: ["server.py"],
    cwd: options.rootDir,
    env: options.env,
    toolNames: [...PAL_TOOL_NAMES],
    idleTtlMs: options.idleTtlMs ?? 5 * 60_000,
    startupTimeoutMs: options.startupTimeoutMs ?? 20_000,
  };
}

/** A truthful availability verdict for the PAL server's python env. */
export interface PalAvailability {
  /** True only when BOTH the python executable and server.py exist on disk. */
  readonly available: boolean;
  /** The resolved python path that was probed. */
  readonly pythonPath: string;
  /** The resolved server entry path that was probed. */
  readonly serverEntry: string;
  /** Truthful reason when unavailable (never a fake "ok"). */
  readonly reason?: string;
}

/**
 * Probe whether the PAL python env is actually present. This is the degrade-safe
 * gate: it reports the real on-disk state and never claims availability it cannot
 * prove. Used to surface truthful health before the process is even started.
 */
export function palServerAvailability(options: PalServerOptions): PalAvailability {
  const pythonPath = options.pythonPath ?? defaultPalPythonPath(options.rootDir);
  const serverEntry = join(options.rootDir, "server.py");
  const hasPython = existsSync(pythonPath);
  const hasEntry = existsSync(serverEntry);
  if (hasPython && hasEntry) {
    return { available: true, pythonPath, serverEntry };
  }
  const missing: string[] = [];
  if (!hasPython) missing.push(`python venv (${pythonPath})`);
  if (!hasEntry) missing.push(`server entry (${serverEntry})`);
  return {
    available: false,
    pythonPath,
    serverEntry,
    reason: `PAL MCP server unavailable: missing ${missing.join(" and ")}.`,
  };
}
