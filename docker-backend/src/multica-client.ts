/**
 * @module multica-client
 *
 * Multica managed-agents/squads/assignment loopback adapter — fuses
 * `go/multica` as a backend-supervised subprocess/loopback HTTP client, gated
 * by env, degrade-safe when the binary or service is absent.
 *
 * Multica (https://multica.ai) is an open-source managed-agents platform:
 * assign issues to agents like colleagues, squads group agents under a leader
 * for stable work routing, and the full task lifecycle is tracked with
 * real-time WebSocket progress streaming.
 *
 * FUSION PATTERN (mirrors tensorzero-client.ts + openfang-daemon.ts):
 *   - We NEVER build the Go binary here. If no prebuilt binary is found
 *     (MULTICA_BIN env or go/multica/server/bin/multica-server) the client
 *     degrades safely: health() returns { available: false }, all calls
 *     return explicit not-available results, never faked success.
 *   - Alternatively, MULTICA_URL can point at an externally-managed instance
 *     (Docker Compose, cloud-hosted) — in that case we skip spawning and use
 *     the existing endpoint directly.
 *   - The supervisor spawns the binary once on boot, waits for /health 200,
 *     and thereafter restarts with exponential backoff. Spawn failures never
 *     take the server down.
 *   - Route-edge calls go through the existing squad.service.ts for local
 *     state; multica is an OPTIONAL enrichment layer, not the source of truth.
 *
 * AUTH POSTURE:
 *   - The managed binary binds to loopback-only (127.0.0.1:38080 by default);
 *     network reach is already constrained.
 *   - We forward MULTICA_API_KEY from the parent env only when set; we do NOT
 *     spread the full process.env beyond the configured key and the listen
 *     address, matching openfang-daemon.ts's posture.
 *
 * ENV VARS:
 *   MULTICA_URL          — URL of an externally-managed Multica server (skip spawn).
 *   MULTICA_BIN          — Absolute path to a prebuilt multica-server binary.
 *   MULTICA_LISTEN       — Loopback bind address for the managed binary (default 127.0.0.1:38080).
 *   MULTICA_DAEMON_WAIT_MS — Health-check boot wait (default 5000ms).
 *   MULTICA_API_KEY      — Optional bearer token for Multica's auth layer.
 *   MULTICA_WORKSPACE_ID — Workspace ID to route requests to (header X-Workspace-ID).
 *
 * Binary resolution order (first existing wins):
 *   1. MULTICA_BIN env (absolute path to a prebuilt binary).
 *   2. <repo>/go/multica/server/bin/multica-server.
 *   3. <repo>/go/multica/server/bin/server (alternate build name).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createLogger } from './logger.js';

const logger = createLogger('multica-client');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Env var: absolute path to a prebuilt multica-server binary. */
export const MULTICA_BIN_ENV = 'MULTICA_BIN';

/** Env var: URL of an externally-managed Multica server. */
export const MULTICA_URL_ENV = 'MULTICA_URL';

/**
 * Default loopback address for the managed binary.
 * Port 38080 avoids collision with Multica's own default (8080) and with
 * openfang (4200), tensorzero (3778). Overridable via MULTICA_LISTEN.
 */
const DEFAULT_LISTEN = '127.0.0.1:38080';

/** How long to wait for /health to respond on boot (ms). */
const HEALTH_WAIT_MS = Number(process.env.MULTICA_DAEMON_WAIT_MS) || 5_000;

/** Poll interval while waiting for the health endpoint (ms). */
const HEALTH_POLL_MS = 100;

/** Backoff caps (ms) for supervised restart. */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

// ---------------------------------------------------------------------------
// Binary resolution (NO build — existence-only)
// ---------------------------------------------------------------------------

/**
 * Walk up from this module's compiled location to the repo root (the directory
 * containing `go/multica`). Returns undefined if not found within 12 parents.
 */
function findRepoRoot(): string | undefined {
  const { existsSync: fsExists } = require('node:fs');
  const { dirname: pathDirname, join: pathJoin } = require('node:path');
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return undefined;
  }
  for (let i = 0; i < 12; i++) {
    if (fsExists(pathJoin(dir, 'go', 'multica', 'README.md'))) {
      return dir;
    }
    const parent = pathDirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the multica-server binary path WITHOUT building it. Returns the
 * first existing candidate, or undefined when no prebuilt binary is present
 * (degrade-safe — the client reports "multica unavailable").
 */
export function resolveMulticaBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[MULTICA_BIN_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }

  const root = findRepoRoot();
  if (!root) return undefined;

  const binDir = path.join(root, 'go', 'multica', 'server', 'bin');
  const candidates = [
    path.join(binDir, 'multica-server'),
    path.join(binDir, 'server'),
  ];
  return candidates.find((p) => existsSync(p));
}

// ---------------------------------------------------------------------------
// Health-check polling
// ---------------------------------------------------------------------------

/** Poll Multica's /health until it responds 200 or the deadline passes. */
async function waitForHealth(listenAddr: string, deadlineMs: number): Promise<boolean> {
  const start = Date.now();
  const url = `http://${listenAddr}/health`;
  for (;;) {
    try {
      const resp = await (globalThis.fetch as typeof fetch)(url, { signal: AbortSignal.timeout(1_000) });
      if (resp.ok) return true;
    } catch {
      // Not up yet — keep polling.
    }
    if (Date.now() - start >= deadlineMs) return false;
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

// ---------------------------------------------------------------------------
// Daemon handle + lifecycle
// ---------------------------------------------------------------------------

export interface MulticaHandle {
  /** The loopback address the binary is listening on (e.g. "127.0.0.1:38080"). */
  readonly listenAddr: string;
  /** The resolved binary that was spawned (undefined for external mode). */
  readonly binPath: string | undefined;
  /** The spawned child process (undefined for external mode). */
  readonly child: ChildProcess | undefined;
  /** Canonical base URL for this instance. */
  readonly baseUrl: string;
}

let started: Promise<MulticaHandle | undefined> | undefined;
let handle: MulticaHandle | undefined;

/**
 * Ensure the Multica server is reachable (idempotent). Resolution order:
 *
 * 1. If MULTICA_URL is set — use it as the base URL without spawning.
 * 2. If a prebuilt server binary exists — spawn it and wait for /health.
 * 3. Otherwise — degrade safely: report "multica unavailable".
 *
 * Resolves to `undefined` — never throws — when unavailable.
 */
export function ensureMulticaServer(): Promise<MulticaHandle | undefined> {
  if (started) return started;
  started = startMulticaServer();
  return started;
}

async function startMulticaServer(): Promise<MulticaHandle | undefined> {
  // Under the test runner we do NOT auto-spawn: a background child process
  // makes test assertions non-deterministic. Tests that want the real binary
  // opt in with MULTICA_DAEMON_FORCE=1.
  if (process.env.NODE_ENV === 'test' && process.env.MULTICA_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // Externally-managed server (MULTICA_URL set): use it as-is, no spawn.
  const externalUrl = process.env[MULTICA_URL_ENV]?.trim();
  if (externalUrl) {
    const listenAddr = externalUrl.replace(/^https?:\/\//, '');
    logger.info(
      { url: externalUrl },
      'Multica server is externally managed (MULTICA_URL) — connecting, not spawning',
    );
    const h: MulticaHandle = { listenAddr, binPath: undefined, child: undefined, baseUrl: externalUrl };
    handle = h;
    return h;
  }

  const binPath = resolveMulticaBin();
  if (!binPath) {
    logger.info(
      'Multica server binary not built — multica unavailable (degrade-safe). ' +
        `Set ${MULTICA_URL_ENV} or ${MULTICA_BIN_ENV} to enable managed-agents/squads. ` +
        'The local squad.service.ts handles squad state without Multica.',
    );
    return undefined;
  }

  const listenAddr = process.env.MULTICA_LISTEN?.trim() || DEFAULT_LISTEN;
  return spawnMultica(binPath, listenAddr, 0);
}

async function spawnMultica(
  binPath: string,
  listenAddr: string,
  attempt: number,
): Promise<MulticaHandle | undefined> {
  try {
    const childEnv: NodeJS.ProcessEnv = {
      PORT: listenAddr.split(':')[1] ?? '38080',
    };
    // Forward the API key only when set — do NOT inject it unconditionally.
    if (process.env.MULTICA_API_KEY) {
      childEnv['MULTICA_API_KEY'] = process.env.MULTICA_API_KEY;
    }

    const child = spawn(binPath, [], {
      env: childEnv,
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
    });

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      exitedEarly = handle === undefined;
      logger.warn(
        { code, signal, binPath, listenAddr, attempt },
        'Multica server exited — will supervise with backoff',
      );
      handle = undefined;

      if (process.env.NODE_ENV !== 'test') {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        logger.info(
          { backoffMs, attempt: attempt + 1 },
          'Multica server restarting after backoff',
        );
        setTimeout(() => {
          void spawnMultica(binPath, listenAddr, attempt + 1).then((h) => {
            if (h) started = Promise.resolve(h);
          });
        }, backoffMs);
      }
    });

    child.once('error', (err) => {
      logger.warn({ err, binPath }, 'Multica server spawn error — staying on local squad.service fallback');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ daemon: line }, 'multica server stderr');
    });

    if (typeof child.unref === 'function') {
      child.unref();
    }

    const baseUrl = `http://${listenAddr}`;
    const up = await waitForHealth(listenAddr, HEALTH_WAIT_MS);
    if (!up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { binPath, listenAddr, exitCode: child.exitCode, attempt },
        'Multica server did not pass health check — degrading to local squad.service.ts ' +
          '(is the port free? Try MULTICA_LISTEN=127.0.0.1:38081 if 38080 is taken)',
      );
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    handle = { listenAddr, binPath, child, baseUrl };
    logger.info(
      { binPath, listenAddr },
      'Multica server spawned — managed-agents/squads now route through the Multica loopback',
    );
    return handle;
  } catch (err) {
    logger.warn(
      { err, binPath },
      'failed to spawn Multica server — staying on local squad.service.ts fallback (degrade-safe)',
    );
    return undefined;
  }
}

/** The live handle, if the server is up (read-only inspection / health). */
export function multicaHandle(): MulticaHandle | undefined {
  return handle;
}

/** Stop the spawned server (best-effort) and reset the seam. Idempotent. */
export function stopMulticaServer(): void {
  const h = handle;
  handle = undefined;
  started = undefined;
  if (h?.child) {
    try {
      h.child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
  }
}

/** Test seam: reset the memoized start state without touching a running server. */
export function __resetMulticaForTest(): void {
  handle = undefined;
  started = undefined;
}

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

export interface MulticaHealthResult {
  /** Whether the Multica server is reachable and healthy. */
  available: boolean;
  /** How the handle was obtained: 'managed' | 'external' | 'unconfigured'. */
  mode: 'managed' | 'external' | 'unconfigured';
  /** Human-readable reason when available=false. */
  reason?: string;
  /** The base URL being used (when available=true). */
  baseUrl?: string;
}

/**
 * Check Multica server health. Truthful — never returns available=true unless
 * the server actually answers /health with 200.
 */
export async function multicaHealth(): Promise<MulticaHealthResult> {
  const h = handle;

  // Externally-managed: probe the configured URL directly.
  const externalUrl = process.env[MULTICA_URL_ENV]?.trim();
  if (!h && externalUrl) {
    try {
      const resp = await (globalThis.fetch as typeof fetch)(
        `${externalUrl}/health`,
        { signal: AbortSignal.timeout(2_000) },
      );
      if (resp.ok) {
        return { available: true, mode: 'external', baseUrl: externalUrl };
      }
      return { available: false, mode: 'external', reason: `health check returned ${resp.status}` };
    } catch (err) {
      return {
        available: false,
        mode: 'external',
        reason: `health check failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (!h) {
    return {
      available: false,
      mode: 'unconfigured',
      reason: 'no Multica server configured or spawned — set MULTICA_URL or MULTICA_BIN',
    };
  }

  // Managed binary: probe the loopback handle.
  try {
    const resp = await (globalThis.fetch as typeof fetch)(
      `${h.baseUrl}/health`,
      { signal: AbortSignal.timeout(2_000) },
    );
    if (resp.ok) {
      return { available: true, mode: 'managed', baseUrl: h.baseUrl };
    }
    return { available: false, mode: 'managed', reason: `health check returned ${resp.status}` };
  } catch (err) {
    return {
      available: false,
      mode: 'managed',
      reason: `health check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Degrade-safe squad/agent API client
// ---------------------------------------------------------------------------

export interface MulticaSquadParams {
  /** Multica workspace ID (required when talking to a multi-tenant server). */
  workspaceId?: string;
  /** Bearer token for Multica's auth layer. */
  apiKey?: string;
}

function buildHeaders(params: MulticaSquadParams = {}): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = params.apiKey ?? process.env.MULTICA_API_KEY;
  const workspaceId = params.workspaceId ?? process.env.MULTICA_WORKSPACE_ID;
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (workspaceId) headers['X-Workspace-ID'] = workspaceId;
  return headers;
}

export interface MulticaSquad {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  leader_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface MulticaListSquadsResult {
  /** Whether the call was routed through the Multica loopback (false = unavailable). */
  routed: boolean;
  /** Squads returned by Multica (only when routed=true). */
  squads?: MulticaSquad[];
  /** Reason the server was not used (when routed=false). */
  reason?: string;
}

/**
 * List squads from Multica. Returns { routed: false } when the server is
 * absent — the caller should fall back to squad.service.ts local state.
 * Never throws.
 */
export async function listMulticaSquads(
  params: MulticaSquadParams = {},
): Promise<MulticaListSquadsResult> {
  const h = handle;
  if (!h) {
    return {
      routed: false,
      reason: 'Multica server unavailable — local squad.service.ts is authoritative',
    };
  }

  try {
    const resp = await (globalThis.fetch as typeof fetch)(
      `${h.baseUrl}/api/squads`,
      {
        method: 'GET',
        headers: buildHeaders(params),
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!resp.ok) {
      return { routed: false, reason: `Multica /api/squads returned ${resp.status}` };
    }

    const data = await resp.json() as unknown;
    const squads = Array.isArray(data) ? (data as MulticaSquad[]) : [];
    return { routed: true, squads };
  } catch (err) {
    logger.warn({ err }, 'listMulticaSquads — call failed, degrading to local squads');
    return {
      routed: false,
      reason: `call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface MulticaAssignResult {
  /** Whether the call was routed through the Multica loopback. */
  routed: boolean;
  /** Multica issue/task ID returned when the assignment was accepted. */
  issueId?: string;
  /** Reason the server was not used (when routed=false). */
  reason?: string;
}

/**
 * Assign a task to a Multica squad or agent by posting to the Multica issues
 * API. Returns { routed: false } when the server is absent — the caller should
 * fall back to local task dispatch. Never throws.
 */
export async function assignToMultica(
  title: string,
  assigneeId: string,
  assigneeType: 'agent' | 'squad',
  params: MulticaSquadParams = {},
): Promise<MulticaAssignResult> {
  const h = handle;
  if (!h) {
    return {
      routed: false,
      reason: 'Multica server unavailable — use local agent dispatch',
    };
  }

  try {
    const body = {
      title,
      assignee_id: assigneeId,
      assignee_type: assigneeType,
    };

    const resp = await (globalThis.fetch as typeof fetch)(
      `${h.baseUrl}/api/issues`,
      {
        method: 'POST',
        headers: buildHeaders(params),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      return { routed: false, reason: `Multica /api/issues returned ${resp.status}` };
    }

    const data = await resp.json() as Record<string, unknown>;
    const issueId = typeof data['id'] === 'string' ? data['id'] : undefined;
    return { routed: true, issueId };
  } catch (err) {
    logger.warn({ err, title, assigneeId, assigneeType }, 'assignToMultica — call failed, degrading');
    return {
      routed: false,
      reason: `call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
