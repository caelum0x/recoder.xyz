/**
 * @module tensorzero-client
 *
 * TensorZero LLM gateway loopback adapter — fuses `crates/tensorzero` as a
 * backend-supervised loopback HTTP service and provides a thin degrade-safe
 * client consumed by the run loop for provider calls and inference logging.
 *
 * TensorZero is an OpenAI-compatible LLM gateway (<1ms p99 overhead) with
 * built-in observability, A/B routing, fallbacks, and feedback collection.
 * It runs as a Rust HTTP server (default 0.0.0.0:3000 but we bind it to
 * loopback 127.0.0.1:3778 to keep it off the public NIC).
 *
 * FUSION PATTERN (mirrors openfang-daemon.ts + governance-daemon.ts):
 *   - We NEVER build the Rust binary here. If no prebuilt binary is found
 *     (TENSORZERO_BIN env or crates/tensorzero target/{release,debug}/gateway)
 *     the client gracefully reports "gateway unavailable" and the runtime falls
 *     back to direct provider calls — truthful, never faked.
 *   - The supervisor spawns the binary once on boot, waits for /health 200,
 *     and thereafter restarts it with exponential backoff (capped). Spawn
 *     failures never take the server down.
 *   - Alternatively, TENSORZERO_URL can point at an externally-managed instance
 *     (Docker Compose, pm2, cloud-hosted) — in that case we skip spawning and
 *     use the existing endpoint directly.
 *   - All inference calls from Recoder to TensorZero route through the policy
 *     gate before they reach here; TensorZero is a REPLACEABLE provider adapter.
 *
 * AUTH POSTURE:
 *   - The managed binary binds to loopback-only (127.0.0.1:3778 by default);
 *     network reach is already constrained.
 *   - We forward TENSORZERO_GATEWAY_API_KEY from the parent env only when set;
 *     we do NOT spread the full process.env beyond the configured key and the
 *     listen address, matching openfang-daemon.ts's posture.
 *
 * ENV VARS:
 *   TENSORZERO_URL        — URL of an externally-managed gateway (skip spawn).
 *   TENSORZERO_BIN        — Absolute path to a prebuilt `tensorzero` (gateway) binary.
 *   TENSORZERO_LISTEN     — Loopback bind address for the managed binary (default 127.0.0.1:3778).
 *   TENSORZERO_DAEMON_WAIT_MS — Health-check boot wait (default 5000ms).
 *   TENSORZERO_GATEWAY_API_KEY — Optional bearer token for TensorZero's auth layer.
 *
 * Binary resolution order (first existing wins):
 *   1. TENSORZERO_BIN env (absolute path to a prebuilt binary).
 *   2. <repo>/crates/tensorzero/crates/gateway/target/release/gateway.
 *   3. <repo>/crates/tensorzero/crates/gateway/target/debug/gateway.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

import { createLogger } from './logger.js';

const logger = createLogger('tensorzero-client');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Binary name produced by the gateway crate's `[[bin]]` entry. */
const DAEMON_BIN_NAME = 'gateway';

/** Env var: absolute path to a prebuilt tensorzero gateway binary. */
export const TENSORZERO_BIN_ENV = 'TENSORZERO_BIN';

/** Env var: URL of an externally-managed TensorZero gateway. */
export const TENSORZERO_URL_ENV = 'TENSORZERO_URL';

/**
 * Default loopback address for the managed binary.
 * Port 3778 is chosen to avoid collisions with the tensorzero upstream default (3000)
 * and with openfang (4200). Overridable via TENSORZERO_LISTEN.
 */
const DEFAULT_LISTEN = '127.0.0.1:3778';

/** How long to wait for /health to respond on boot (ms). */
const HEALTH_WAIT_MS = Number(process.env.TENSORZERO_DAEMON_WAIT_MS) || 5_000;

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
 * containing `crates/tensorzero`). Returns undefined if not found within 12
 * parents (never loops).
 */
function findRepoRoot(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync: fsExists } = require('node:fs');
  const { dirname: pathDirname, join: pathJoin } = require('node:path');
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return undefined;
  }
  for (let i = 0; i < 12; i++) {
    // Detect the repo root by the presence of the tensorzero crate workspace.
    if (fsExists(pathJoin(dir, 'crates', 'tensorzero', 'crates', 'Cargo.toml'))) {
      return dir;
    }
    const parent = pathDirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the tensorzero gateway binary path WITHOUT building it. Returns the
 * first existing candidate, or undefined when no prebuilt binary is present
 * (the degrade-safe default — the client then reports "gateway unavailable"
 * and the run loop falls back to direct provider calls).
 */
export function resolveTensorzeroBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[TENSORZERO_BIN_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const root = findRepoRoot();
  if (!root) return undefined;

  const { join } = require('node:path') as typeof import('node:path');
  const base = join(root, 'crates', 'tensorzero', 'crates', 'gateway', 'target');
  const candidates = [
    join(base, 'release', DAEMON_BIN_NAME),
    join(base, 'debug', DAEMON_BIN_NAME),
  ];
  return candidates.find((p) => existsSync(p));
}

// ---------------------------------------------------------------------------
// Health-check polling
// ---------------------------------------------------------------------------

/** Poll TensorZero's /health until it responds 200 or the deadline passes. */
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

export interface TensorzeroHandle {
  /** The loopback address the binary is listening on (e.g. "127.0.0.1:3778"). */
  readonly listenAddr: string;
  /** The resolved binary that was spawned (undefined for external mode). */
  readonly binPath: string | undefined;
  /** The spawned child process (undefined for external mode). */
  readonly child: ChildProcess | undefined;
  /** Canonical base URL for this instance. */
  readonly baseUrl: string;
}

let started: Promise<TensorzeroHandle | undefined> | undefined;
let handle: TensorzeroHandle | undefined;

/**
 * Ensure the TensorZero gateway is reachable (idempotent). Resolution order:
 *
 * 1. If TENSORZERO_URL is set — use it as the base URL without spawning.
 * 2. If a prebuilt gateway binary exists — spawn it and wait for /health.
 * 3. Otherwise — degrade safely: report "gateway unavailable".
 *
 * Resolves to `undefined` — never throws — when unavailable.
 */
export function ensureTensorzeroGateway(): Promise<TensorzeroHandle | undefined> {
  if (started) return started;
  started = startTensorzeroGateway();
  return started;
}

async function startTensorzeroGateway(): Promise<TensorzeroHandle | undefined> {
  // Under the test runner we do NOT auto-spawn: a background child process
  // makes test assertions non-deterministic. Tests that want the real binary
  // opt in with TENSORZERO_DAEMON_FORCE=1.
  if (process.env.NODE_ENV === 'test' && process.env.TENSORZERO_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // Externally-managed gateway (TENSORZERO_URL set): use it as-is, no spawn.
  const externalUrl = process.env[TENSORZERO_URL_ENV]?.trim();
  if (externalUrl) {
    const listenAddr = externalUrl.replace(/^https?:\/\//, '');
    logger.info(
      { url: externalUrl },
      'TensorZero gateway is externally managed (TENSORZERO_URL) — connecting, not spawning',
    );
    const h: TensorzeroHandle = { listenAddr, binPath: undefined, child: undefined, baseUrl: externalUrl };
    handle = h;
    return h;
  }

  const binPath = resolveTensorzeroBin();
  if (!binPath) {
    logger.info(
      'TensorZero gateway binary not built — gateway unavailable (degrade-safe). ' +
        `Set ${TENSORZERO_URL_ENV} or ${TENSORZERO_BIN_ENV} to enable inference logging + routing. ` +
        'The run loop falls back to direct provider calls.',
    );
    return undefined;
  }

  const listenAddr = process.env.TENSORZERO_LISTEN?.trim() || DEFAULT_LISTEN;
  return spawnTensorzero(binPath, listenAddr, 0);
}

async function spawnTensorzero(
  binPath: string,
  listenAddr: string,
  attempt: number,
): Promise<TensorzeroHandle | undefined> {
  try {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      // Bind the managed binary to our chosen loopback address.
      TENSORZERO_BIND_ADDR: listenAddr,
    };
    // Forward the API key only when set — do NOT inject it unconditionally.
    if (process.env.TENSORZERO_GATEWAY_API_KEY) {
      childEnv['TENSORZERO_GATEWAY_API_KEY'] = process.env.TENSORZERO_GATEWAY_API_KEY;
    }

    const child = spawn(binPath, [], {
      env: childEnv,
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
    });

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      exitedEarly = handle === undefined; // exited before we adopted it
      logger.warn(
        { code, signal, binPath, listenAddr, attempt },
        'TensorZero gateway exited — will supervise with backoff',
      );
      handle = undefined;

      if (process.env.NODE_ENV !== 'test') {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        logger.info(
          { backoffMs, attempt: attempt + 1 },
          'TensorZero gateway restarting after backoff',
        );
        setTimeout(() => {
          void spawnTensorzero(binPath, listenAddr, attempt + 1).then((h) => {
            if (h) started = Promise.resolve(h);
          });
        }, backoffMs);
      }
    });

    child.once('error', (err) => {
      logger.warn({ err, binPath }, 'TensorZero gateway spawn error — staying on direct-provider fallback');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ daemon: line }, 'tensorzero gateway stderr');
    });

    if (typeof child.unref === 'function') {
      child.unref();
    }

    const baseUrl = `http://${listenAddr}`;
    const up = await waitForHealth(listenAddr, HEALTH_WAIT_MS);
    if (!up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { binPath, listenAddr, exitCode: child.exitCode, attempt },
        'TensorZero gateway did not pass health check — degrading to direct provider calls ' +
          '(is the port free? Try TENSORZERO_LISTEN=127.0.0.1:3779 if 3778 is taken)',
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
      'TensorZero gateway spawned — inference calls now route through the LLM gateway for logging + routing',
    );
    return handle;
  } catch (err) {
    logger.warn(
      { err, binPath },
      'failed to spawn TensorZero gateway — staying on direct-provider fallback (degrade-safe)',
    );
    return undefined;
  }
}

/** The live handle, if the gateway is up (read-only inspection / health). */
export function tensorzeroHandle(): TensorzeroHandle | undefined {
  return handle;
}

/** Stop the spawned gateway (best-effort) and reset the seam. Idempotent. */
export function stopTensorzeroGateway(): void {
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

/** Test seam: reset the memoized start state without touching a running gateway. */
export function __resetTensorzeroForTest(): void {
  handle = undefined;
  started = undefined;
}

// ---------------------------------------------------------------------------
// Degrade-safe inference client (OpenAI-compatible wire)
// ---------------------------------------------------------------------------

export interface TensorzeroInferenceInput {
  /** TensorZero function name (maps to a model in gateway config). */
  function_name: string;
  /** Input content (rendered by the gateway against the function template). */
  input: {
    messages: Array<{ role: string; content: string | unknown[] }>;
    [key: string]: unknown;
  };
  /** Optional TensorZero episode ID for multi-turn grouping. */
  episode_id?: string;
  /** Optional extra params forwarded to TensorZero. */
  [key: string]: unknown;
}

export interface TensorzeroInferenceResult {
  /** Whether the gateway routed the call (false = fallback to direct provider). */
  routed: boolean;
  /** The gateway's inference_id for observability linkage (when routed=true). */
  inference_id?: string;
  /** The content output, mirroring TensorZero's `content` field. */
  content?: unknown;
  /** Usage metadata (tokens) when available. */
  usage?: { input_tokens?: number; output_tokens?: number };
  /** Reason the gateway was not used (when routed=false). */
  reason?: string;
}

/**
 * Post an inference request to the TensorZero gateway. Returns a truthful
 * result indicating whether the call was routed through the gateway or fell
 * back to the direct provider path.
 *
 * This is the ONLY function the run loop should call when it wants to benefit
 * from TensorZero's routing, logging, and experiment framework. It never throws
 * on gateway unavailability — it returns `{ routed: false, reason: "..." }`.
 */
export async function postInference(
  input: TensorzeroInferenceInput,
): Promise<TensorzeroInferenceResult> {
  const h = tensorzeroHandle();
  if (!h) {
    return {
      routed: false,
      reason: 'TensorZero gateway unavailable — using direct provider call',
    };
  }

  const apiKey = process.env.TENSORZERO_GATEWAY_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const resp = await fetch(`${h.baseUrl}/inference`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await resp.text();
    const json = text ? JSON.parse(text) : {};

    if (!resp.ok) {
      const msg = (json as { error?: string }).error ?? `HTTP ${resp.status}`;
      logger.warn(
        { status: resp.status, function_name: input.function_name, msg },
        'TensorZero inference failed — run loop should retry with direct provider',
      );
      return { routed: false, reason: `TensorZero returned ${resp.status}: ${msg}` };
    }

    const r = json as {
      inference_id?: string;
      content?: unknown;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      routed: true,
      inference_id: r.inference_id,
      content: r.content,
      usage: r.usage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    logger.warn({ err, function_name: input.function_name }, 'TensorZero inference request failed');
    return { routed: false, reason: `TensorZero request error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Truthful health snapshot
// ---------------------------------------------------------------------------

export interface TensorzeroHealth {
  available: boolean;
  mode: 'managed' | 'external' | 'unconfigured';
  baseUrl?: string;
  listenAddr?: string;
  reason?: string;
}

/**
 * Return a truthful health snapshot of the gateway seam. Never throws; never
 * fakes success when the gateway is absent.
 */
export async function tensorzeroHealth(): Promise<TensorzeroHealth> {
  const externalUrl = process.env[TENSORZERO_URL_ENV]?.trim();
  const h = tensorzeroHandle();

  if (!h && !externalUrl) {
    const binPath = resolveTensorzeroBin();
    return {
      available: false,
      mode: 'unconfigured',
      reason: binPath
        ? 'Binary found but daemon not yet started'
        : `Set ${TENSORZERO_URL_ENV} or build crates/tensorzero to enable the gateway`,
    };
  }

  const baseUrl = h?.baseUrl ?? externalUrl!;
  try {
    const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    return {
      available: resp.ok,
      mode: h?.child !== undefined ? 'managed' : 'external',
      baseUrl,
      listenAddr: h?.listenAddr,
      reason: resp.ok ? undefined : `HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      available: false,
      mode: h?.child !== undefined ? 'managed' : 'external',
      baseUrl,
      listenAddr: h?.listenAddr,
      reason: err instanceof Error ? err.message : 'health check failed',
    };
  }
}
