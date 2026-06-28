/**
 * Configuration for an EXTERNAL stdio MCP server that interop supervises.
 *
 * "External" means a real OS process we did not write and do not trust beyond
 * its declared contract — e.g. the cloned Python `py/pal-mcp-server`. We host it
 * over stdio MCP and gate every call through the same authorize→risk→policy→
 * audit path as in-proc servers. This config is the *trusted* declaration of how
 * to launch and bound the process; the process's *self-description* (its
 * advertised tools) remains untrusted and goes through the catalog validator.
 */

import type { McpServerKind } from "../registry/registry";

export interface ExternalMcpServerConfig {
  /** Stable server id used as the registry key and audit serverId. */
  readonly serverId: string;
  /** Server kind for risk/policy classification. */
  readonly kind: McpServerKind;
  /** Human-facing name. */
  readonly displayName: string;
  /** The executable to spawn (absolute path preferred; resolved at launch). */
  readonly command: string;
  /** Arguments passed to the executable. */
  readonly args: readonly string[];
  /** Working directory for the process. */
  readonly cwd: string;
  /**
   * Environment overlay for the child. Secrets are injected here at launch from
   * the host env — NEVER hardcoded in the config object (security rule).
   */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * The TRUSTED allowlist of tool names this server is permitted to expose. The
   * server's advertised catalog is intersected with this list — a server cannot
   * widen its own surface.
   */
  readonly toolNames: readonly string[];
  /** Idle TTL in ms before the supervisor stops an unused server (0 = never). */
  readonly idleTtlMs: number;
  /** Max ms to wait for the process to become ready before declaring it unhealthy. */
  readonly startupTimeoutMs: number;
}
