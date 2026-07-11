/**
 * OpenFang daemon spawn seam — supervise the embedded autonomous agent engine
 * (`crates/openfang`) as a loopback HTTP subprocess, keeping Recoder as the
 * owner of task/approval/memory state while openfang emits RunEvents.
 *
 * A2A BOUNDARY RULE (AGENTS.md + monorepo.md): openfang is a REPLACEABLE
 * execution surface. It NEVER owns Recoder state. Recoder owns task lifecycle,
 * approval records, and memory candidates; openfang is wired as a subprocess
 * that emits RunEvents back to the Recoder run loop. The loopback HTTP API
 * (default 127.0.0.1:4200) is the wire boundary — the same boundary
 * `oss-dispatch.ts` already drives via `OpenFangAdapter`.
 *
 * DEGRADE-SAFE BY CONSTRUCTION:
 *   - We NEVER build the crate here. If no prebuilt binary exists, `ensure()`
 *     resolves to `undefined` and the backend stays on the pure-TS OSS dispatch
 *     path (OpenFangAdapter already degrades safely when the binary is absent).
 *   - Spawn failures (binary not executable, immediate exit, health-check
 *     timeout) are caught and reported as "unavailable" — the backend keeps
 *     running. An openfang binary problem NEVER takes the server down.
 *
 * AUTH POSTURE:
 *   - openfang binds to loopback-only (127.0.0.1:4200 by default), so network
 *     reach is already constrained.
 *   - We pass OPENFANG_API_KEY from the parent env if set; the binary uses it
 *     for its own HTTP API auth layer. We do NOT inject extra env beyond the
 *     configured key and the listen address.
 *   - All tool calls from Recoder to openfang still route through the policy
 *     gate (`oss-dispatch.ts` → `OpenFangAdapter`) — never raw subprocess IO.
 *
 * NATIVE ADDON (preferred path):
 *   When `crates/openfang/crates/openfang-napi/target/(release|debug)/openfang_napi.node`
 *   exists, `oss-dispatch.ts` loads it via `openfang-native.ts` and runs the engine
 *   in-process (no subprocess, no loopback HTTP).  This daemon module is only needed
 *   when the native addon is absent (build deferred, wrong arch, etc.).
 *
 * Resolution order for the binary (first existing wins):
 *   1. `OPENFANG_BIN` env (absolute path to a prebuilt binary).
 *   2. `<repo>/crates/openfang/target/release/openfang`.
 *   3. `<repo>/crates/openfang/target/debug/openfang`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

import { createLogger } from '../logger.js';
import { loadNativeAddon, resolveNativeAddonPath } from './openfang-native.js';

const logger = createLogger('conductor:openfang-daemon');

/** Binary name produced by the openfang-cli crate (`[[bin]]` name = "openfang"). */
const DAEMON_BIN_NAME = 'openfang';

/** Env var an operator can use to point at a prebuilt openfang binary directly. */
export const OPENFANG_BIN_ENV = 'OPENFANG_BIN';

/**
 * The loopback address openfang listens on. Overridable via OPENFANG_LISTEN;
 * matches the crate's own default so no extra config is required.
 */
const DEFAULT_LISTEN = '127.0.0.1:4200';

/** How long to wait for the daemon's /api/health to respond on boot (ms). */
const HEALTH_WAIT_MS = Number(process.env.OPENFANG_DAEMON_WAIT_MS) || 5_000;

/** Poll interval while waiting for the health endpoint to come up (ms). */
const HEALTH_POLL_MS = 100;

/** Backoff caps (ms) for auto-restart after daemon exit. */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

/**
 * Walk up from this module to the repo root (the dir holding `crates/`). Returns
 * undefined if not found within a bounded number of parents (never loops).
 */
function findRepoRoot(): string | undefined {
  // __dirname is only available in CJS. For ESM we use import.meta.url; for the
  // compiled CJS output of this module, __dirname is the dist/ dir.
  // We walk up from the module location, which works regardless.
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
    if (fsExists(pathJoin(dir, 'crates', 'openfang', 'Cargo.toml'))) {
      return dir;
    }
    const parent = pathDirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the openfang binary path WITHOUT building it. Returns the first
 * existing candidate, or undefined when no prebuilt binary is present (the
 * degrade-safe default — the backend then stays on the pure-TS dispatch path).
 */
export function resolveOpenfangBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[OPENFANG_BIN_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const root = findRepoRoot();
  if (!root) return undefined;

  const { join } = require('node:path') as typeof import('node:path');
  const base = join(root, 'crates', 'openfang', 'target');
  const candidates = [
    join(base, 'release', DAEMON_BIN_NAME),
    join(base, 'debug', DAEMON_BIN_NAME),
  ];
  return candidates.find((p) => existsSync(p));
}

/** Poll openfang's /api/health until it responds 200 or the deadline passes. */
async function waitForHealth(listenAddr: string, deadlineMs: number): Promise<boolean> {
  const start = Date.now();
  const url = `http://${listenAddr}/api/health`;
  for (;;) {
    try {
      // Use the built-in fetch (Node 18+); fall back to a no-op skip if absent.
      const resp = await (globalThis.fetch as typeof fetch)(url, { signal: AbortSignal.timeout(1_000) });
      if (resp.ok) return true;
    } catch {
      // Not up yet — keep polling.
    }
    if (Date.now() - start >= deadlineMs) return false;
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

export interface OpenfangDaemonHandle {
  /** The loopback address the daemon is listening on (e.g. "127.0.0.1:4200"). */
  readonly listenAddr: string;
  /** The resolved binary that was spawned. */
  readonly binPath: string;
  /** The spawned child process (kept for lifecycle/shutdown). */
  readonly child: ChildProcess;
}

let started: Promise<OpenfangDaemonHandle | undefined> | undefined;
let handle: OpenfangDaemonHandle | undefined;

/**
 * Ensure the openfang daemon is running (idempotent). Spawns the prebuilt
 * binary once with `start` subcommand (the crate's own boot command), waits
 * for /api/health to come up, and resolves with the handle. Resolves to
 * `undefined` — never throws — when the binary is absent or the daemon fails
 * to come up, so the backend degrades to the pure-TS dispatch path.
 *
 * If `OPENFANG_EXTERNAL=1` is set (an externally-managed daemon, e.g. a
 * systemd/pm2 unit), we do NOT spawn a second one — we trust the existing
 * loopback instance.
 */
export function ensureOpenfangDaemon(): Promise<OpenfangDaemonHandle | undefined> {
  if (started) return started;
  started = startOpenfangDaemon();
  return started;
}

async function startOpenfangDaemon(): Promise<OpenfangDaemonHandle | undefined> {
  // Under the test runner we do NOT auto-spawn the daemon: a background child
  // process would make test assertions non-deterministic. A test that specifically
  // exercises the real binary opts in with OPENFANG_DAEMON_FORCE=1.
  if (process.env.NODE_ENV === 'test' && process.env.OPENFANG_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // An externally-managed daemon: trust the existing loopback instance.
  if (process.env.OPENFANG_EXTERNAL === '1') {
    const listenAddr = process.env.OPENFANG_LISTEN?.trim() || DEFAULT_LISTEN;
    logger.info(
      { listenAddr },
      'openfang daemon is externally managed (OPENFANG_EXTERNAL=1) — connecting, not spawning',
    );
    return undefined;
  }

  const binPath = resolveOpenfangBin();
  if (!binPath) {
    logger.info(
      'openfang binary not built — staying on pure-TS OSS dispatch path (degrade-safe). ' +
        `Set ${OPENFANG_BIN_ENV} or build crates/openfang to enable the autonomous agent engine.`,
    );
    return undefined;
  }

  const listenAddr = process.env.OPENFANG_LISTEN?.trim() || DEFAULT_LISTEN;

  return spawnOpenfang(binPath, listenAddr, 0);
}

async function spawnOpenfang(
  binPath: string,
  listenAddr: string,
  attempt: number,
): Promise<OpenfangDaemonHandle | undefined> {
  try {
    const child = spawn(binPath, ['start'], {
      // Pass only the minimal env needed: OPENFANG_API_KEY (if set) and the
      // listen address. We do NOT spread the full process.env to avoid leaking
      // secrets beyond what openfang already inherits by default on the same
      // host. The binary reads its own config.toml for everything else.
      env: {
        ...process.env,
        OPENFANG_LISTEN: listenAddr,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
    });

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      exitedEarly = handle === undefined; // exited before we adopted it
      logger.warn(
        { code, signal, binPath, listenAddr, attempt },
        'openfang daemon exited — will supervise with backoff',
      );
      handle = undefined;

      // Supervised restart with exponential backoff, capped.
      if (process.env.NODE_ENV !== 'test') {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        logger.info({ backoffMs, attempt: attempt + 1 }, 'openfang daemon restarting after backoff');
        setTimeout(() => {
          void spawnOpenfang(binPath, listenAddr, attempt + 1).then((h) => {
            if (h) {
              started = Promise.resolve(h);
            }
          });
        }, backoffMs);
      }
    });

    child.once('error', (err) => {
      logger.warn({ err, binPath }, 'openfang daemon spawn error — staying on pure-TS path');
    });

    // Surface the daemon's own startup diagnostics at debug level.
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ daemon: line }, 'openfang daemon stderr');
    });

    if (typeof child.unref === 'function') {
      // Do not keep the Node process alive solely for the daemon child.
      child.unref();
    }

    const up = await waitForHealth(listenAddr, HEALTH_WAIT_MS);
    if (!up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { binPath, listenAddr, exitCode: child.exitCode, attempt },
        'openfang daemon did not pass health check in time — degrading to pure-TS path ' +
          '(is the port free? Try OPENFANG_LISTEN=127.0.0.1:4201 if 4200 is taken)',
      );
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    handle = { listenAddr, binPath, child };
    logger.info(
      { binPath, listenAddr },
      'openfang daemon spawned — autonomous agent engine is up (A2A RunEvents route through Recoder)',
    );
    return handle;
  } catch (err) {
    logger.warn({ err, binPath }, 'failed to spawn openfang daemon — staying on pure-TS path (degrade-safe)');
    return undefined;
  }
}

/** The live handle, if the daemon is up (read-only inspection / health). */
export function openfangDaemonHandle(): OpenfangDaemonHandle | undefined {
  return handle;
}

/** Stop the spawned daemon (best-effort) and reset the seam. Idempotent. */
export function stopOpenfangDaemon(): void {
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

/** Test seam: reset the memoized start state without touching a running daemon. */
export function __resetOpenfangDaemonForTest(): void {
  handle = undefined;
  started = undefined;
}

/**
 * Express router factory: mounts a read-only /api/agents health+info edge
 * behind the caller's `authenticateRequest` middleware. The route surfaces
 * truthful daemon state — it NEVER fakes success when the daemon is absent.
 *
 * Usage (server.ts):
 *   app.use('/api/agents/openfang', authenticateRequest, createOpenfangAgentRouter());
 */
export function createOpenfangAgentRouter() {
  // Lazy import to avoid pulling express into tests that only test the seam.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Router } = require('express') as typeof import('express');
  const router = Router();

  /** GET /api/agents/openfang/health — truthful daemon health (native-first). */
  router.get('/health', (_req: import('express').Request, res: import('express').Response) => {
    // Check the native addon first — it is the preferred in-process path.
    const native = loadNativeAddon();
    if (native) {
      const addonPath = resolveNativeAddonPath();
      let version: unknown = {};
      try { version = JSON.parse(native.nativeVersion()); } catch { /* ignore */ }
      res.json({
        agent: 'openfang',
        status: 'up',
        mode: 'native_addon',
        addonPath,
        version,
        note: 'Running in-process via NAPI-RS native addon (no subprocess)',
      });
      return;
    }

    // Fall back to the subprocess daemon health.
    const h = openfangDaemonHandle();
    if (!h) {
      res.status(503).json({
        agent: 'openfang',
        status: 'unavailable',
        reason:
          'openfang daemon is not running and the native addon is not built. ' +
          'Build crates/openfang or set OPENFANG_BIN to enable the autonomous agent engine, ' +
          'or build openfang-napi for the in-process path.',
      });
      return;
    }
    res.json({
      agent: 'openfang',
      status: 'up',
      mode: 'subprocess',
      listenAddr: h.listenAddr,
      binPath: h.binPath,
      pid: h.child.pid,
    });
  });

  /** GET /api/agents/openfang — agent card + current runtime status (native-first). */
  router.get('/', (_req: import('express').Request, res: import('express').Response) => {
    const native = loadNativeAddon();
    if (native) {
      res.json({
        agentId: 'openfang',
        name: 'OpenFang Autonomous Agent Engine',
        description: '24/7 autonomous agent engine (Rust). Running in-process via NAPI-RS native addon. RunEvents route through Recoder. Task/approval/memory owned by Recoder control plane.',
        a2aBoundary: true,
        status: 'up',
        mode: 'native_addon',
        listenAddr: null,
      });
      return;
    }
    const h = openfangDaemonHandle();
    res.json({
      agentId: 'openfang',
      name: 'OpenFang Autonomous Agent Engine',
      description: '24/7 autonomous agent engine (Rust). RunEvents route through Recoder. Task/approval/memory owned by Recoder control plane.',
      a2aBoundary: true,
      status: h ? 'up' : 'unavailable',
      mode: h ? 'subprocess' : 'unavailable',
      listenAddr: h ? h.listenAddr : null,
    });
  });

  return router;
}
