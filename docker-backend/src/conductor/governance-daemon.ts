/**
 * Governance daemon spawn seam — connect the embedded backend to the OWNED Rust
 * governance kernel (`crates/recoder-governance`) at runtime.
 *
 * The @recoder/governance facade already speaks the daemon's native UDS wire
 * (length-prefixed JSON over a Unix-domain socket — see
 * packages/governance/src/ipc/*). What it does NOT do is *start* the daemon: the
 * `GovernanceDaemonClient` only connects to a socket that is already listening.
 * This module is that missing seam. When the daemon binary is present on disk it
 * is spawned once on boot, its socket path is published into `GOVERNANCE_SOCKET`,
 * and `governance-gate.ts` then builds its `Governance` instance with that
 * `daemonSocketPath` so every delivery `decide()` goes through the real Rust
 * kernel (degrading to the pure-TS deny-biased path per-call on any daemon fault).
 *
 * DEGRADE-SAFE BY CONSTRUCTION:
 *   - We NEVER build the crate here. If no prebuilt binary exists, `ensure()`
 *     resolves to `undefined` and the backend stays on the pure-TS path. This is
 *     the default on a build where the crate was not compiled.
 *   - Spawn failures (binary not executable, immediate exit, socket never
 *     appears) are caught and reported as "unavailable" — the backend keeps
 *     running on the TS fallback. A governance binary problem never takes the
 *     server down.
 *
 * AUTH POSTURE (mirrors the daemon's own fail-closed contract, main.rs):
 *   - The daemon REFUSES to start without `INTERNAL_SERVICE_KEY` unless
 *     `GOVERNANCE_ALLOW_INSECURE=1` is set. We pass the parent env through (the
 *     same `INTERNAL_SERVICE_KEY` the backend already loads), so a keyed deploy
 *     authenticates the Node client and the daemon together. We do NOT inject an
 *     insecure bypass — if the key is absent and insecure mode is not explicitly
 *     enabled, the daemon exits and we degrade to TS (truthful, not faked).
 *
 * Resolution order for the binary (first existing wins):
 *   1. `RECODER_GOVERNANCE_DAEMON` env (absolute path to a prebuilt binary).
 *   2. `<repo>/crates/recoder-governance/target/release/recoder-governance-daemon`.
 *   3. `<repo>/crates/recoder-governance/target/debug/recoder-governance-daemon`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, constants as fsConstants } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from '../logger.js';

const logger = createLogger('conductor:governance-daemon');

/** The daemon binary file name (matches the crate's `[[bin]]`). */
const DAEMON_BIN_NAME = 'recoder-governance-daemon';

/** Env var an operator can use to point at a prebuilt daemon binary directly. */
export const GOVERNANCE_DAEMON_ENV = 'RECODER_GOVERNANCE_DAEMON';

/** The env var the daemon and the facade both read for the UDS path. */
export const GOVERNANCE_SOCKET_ENV = 'GOVERNANCE_SOCKET';

/** How long to wait for the daemon to create its socket before giving up (ms). */
const SOCKET_WAIT_MS = Number(process.env.GOVERNANCE_DAEMON_WAIT_MS) || 3_000;

/** Poll interval while waiting for the socket file to appear (ms). */
const SOCKET_POLL_MS = 50;

/**
 * Walk up from this module to the repo root (the dir holding `crates/`). Returns
 * undefined if not found within a bounded number of parents (never loops).
 */
function findRepoRoot(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, 'crates', 'recoder-governance', 'Cargo.toml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the daemon binary path WITHOUT building it. Returns the first existing
 * candidate, or undefined when no prebuilt binary is present (the degrade-safe
 * default — the backend then stays on the pure-TS governance path).
 */
export function resolveGovernanceDaemonBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[GOVERNANCE_DAEMON_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const root = findRepoRoot();
  if (!root) return undefined;
  const base = path.join(root, 'crates', 'recoder-governance', 'target');
  const candidates = [
    path.join(base, 'release', DAEMON_BIN_NAME),
    path.join(base, 'debug', DAEMON_BIN_NAME),
  ];
  return candidates.find((p) => existsSync(p));
}

/** The default per-process socket path when `GOVERNANCE_SOCKET` is unset. */
function defaultSocketPath(): string {
  // Per-pid so two backends on one host never collide on the same socket.
  return path.join(os.tmpdir(), `recoder-governance-${process.pid}.sock`);
}

/** Wait (bounded) for the daemon to create its UDS, so the first decide connects. */
async function waitForSocket(socketPath: string, deadlineMs: number): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      await access(socketPath, fsConstants.F_OK);
      return true;
    } catch {
      if (Date.now() - start >= deadlineMs) return false;
      await new Promise((r) => setTimeout(r, SOCKET_POLL_MS));
    }
  }
}

export interface GovernanceDaemonHandle {
  /** The UDS path the daemon is listening on (also published to GOVERNANCE_SOCKET). */
  readonly socketPath: string;
  /** The resolved binary that was spawned. */
  readonly binPath: string;
  /** The spawned child process (kept for lifecycle/shutdown). */
  readonly child: ChildProcess;
}

let started: Promise<GovernanceDaemonHandle | undefined> | undefined;
let handle: GovernanceDaemonHandle | undefined;

/**
 * Ensure the governance daemon is running (idempotent). Spawns the prebuilt
 * binary once, publishes its socket path into `GOVERNANCE_SOCKET`, and resolves
 * with the handle. Resolves to `undefined` — never throws — when the binary is
 * absent or the daemon fails to come up, so the backend degrades to the pure-TS
 * governance path.
 *
 * If `GOVERNANCE_SOCKET` is already set (an externally-managed daemon, e.g. a
 * systemd/pm2 unit), we do NOT spawn a second one — we trust the existing socket
 * and let the facade connect to it.
 */
export function ensureGovernanceDaemon(): Promise<GovernanceDaemonHandle | undefined> {
  if (started) return started;
  started = startGovernanceDaemon();
  return started;
}

async function startGovernanceDaemon(): Promise<GovernanceDaemonHandle | undefined> {
  // Under the test runner we do NOT auto-spawn the daemon: the conductor suite
  // asserts the deterministic pure-TS deny-biased path (verdict.degraded), and a
  // background child process would make those decisions non-deterministic. A test
  // that specifically exercises the Rust kernel opts in with
  // GOVERNANCE_DAEMON_FORCE=1 (or pre-sets GOVERNANCE_SOCKET to an external one).
  if (process.env.NODE_ENV === 'test' && process.env.GOVERNANCE_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // An externally-managed daemon already publishes a socket: trust it, don't
  // spawn a duplicate. The facade will connect to GOVERNANCE_SOCKET as-is.
  const preexisting = process.env[GOVERNANCE_SOCKET_ENV]?.trim();
  if (preexisting) {
    logger.info(
      { socketPath: preexisting },
      'governance daemon socket pre-set (externally managed) — connecting, not spawning',
    );
    return undefined;
  }

  const binPath = resolveGovernanceDaemonBin();
  if (!binPath) {
    logger.info(
      'governance daemon binary not built — staying on pure-TS governance path (degrade-safe). ' +
        `Set ${GOVERNANCE_DAEMON_ENV} or build crates/recoder-governance to enable the Rust kernel.`,
    );
    return undefined;
  }

  const socketPath = process.env.GOVERNANCE_DAEMON_SOCKET?.trim() || defaultSocketPath();

  try {
    const child = spawn(binPath, [], {
      // Inherit the parent env (notably INTERNAL_SERVICE_KEY) and pin the socket
      // path so the facade and the daemon agree on the same UDS.
      env: { ...process.env, [GOVERNANCE_SOCKET_ENV]: socketPath },
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
    });

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      exitedEarly = handle === undefined; // exited before we adopted it
      logger.warn(
        { code, signal, binPath, socketPath },
        'governance daemon exited — governance falls back to the pure-TS path',
      );
      handle = undefined;
    });
    child.once('error', (err) => {
      logger.warn({ err, binPath }, 'governance daemon spawn error — staying on pure-TS path');
    });
    // Surface the daemon's own startup diagnostics (it logs to stderr) at debug.
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ daemon: line }, 'governance daemon stderr');
    });
    if (typeof child.unref === 'function') {
      // Do not keep the Node process alive solely for the daemon child.
      child.unref();
    }

    const up = await waitForSocket(socketPath, SOCKET_WAIT_MS);
    if (!up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { binPath, socketPath, exitCode: child.exitCode },
        'governance daemon did not open its socket in time — degrading to pure-TS path ' +
          '(is INTERNAL_SERVICE_KEY set, or GOVERNANCE_ALLOW_INSECURE=1 for local dev?)',
      );
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    // Publish the socket so @recoder/governance's resolveDaemonSocketPath finds it
    // even for code paths that read the env directly.
    process.env[GOVERNANCE_SOCKET_ENV] = socketPath;
    handle = { socketPath, binPath, child };
    logger.info({ binPath, socketPath }, 'governance daemon spawned — delivery decisions now route through the Rust kernel');
    return handle;
  } catch (err) {
    logger.warn({ err, binPath }, 'failed to spawn governance daemon — staying on pure-TS path (degrade-safe)');
    return undefined;
  }
}

/** The live handle, if the daemon is up (read-only inspection / health). */
export function governanceDaemonHandle(): GovernanceDaemonHandle | undefined {
  return handle;
}

/** Stop the spawned daemon (best-effort) and reset the seam. Idempotent. */
export function stopGovernanceDaemon(): void {
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
export function __resetGovernanceDaemonForTest(): void {
  handle = undefined;
  started = undefined;
}
