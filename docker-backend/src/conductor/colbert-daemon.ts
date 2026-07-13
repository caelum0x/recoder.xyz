/**
 * ColBERT rerank sidecar spawn seam — supervise `modules/memory/colbert/rerank_server.py`
 * (the late-interaction rerank HTTP endpoint) as an app-owned loopback Flask
 * subprocess, mirroring the proven `openfang-daemon.ts` pattern (resolve →
 * spawn → wait-for-health → auto-restart with capped backoff → degrade-safe).
 *
 * FUSION MODE (RECODER-DEEP-FUSION-PLAN.md §py/): `modules/memory/colbert` was an
 * HTTP-URL seam — something external had to start it and export
 * `COLBERT_RERANK_URL`. This module makes docker-backend the owner: it spawns
 * and supervises the Python process itself and exports the URL the existing
 * consumer (`conductor/colbert-rerank.ts`, which reads `COLBERT_RERANK_URL`
 * lazily per-call) already understands. No consumer changes needed.
 *
 * DEGRADE-SAFE BY CONSTRUCTION:
 *   - We NEVER install Python deps here. If python3 or the entrypoint is
 *     absent, `ensure()` resolves to `undefined` and the conductor stays on
 *     the identity (no-rerank) order — `colbertRerank` already degrades when
 *     the URL is unset.
 *   - The py server itself soft-fails: it boots (and answers /health) even
 *     without torch/colbert installed, reporting `rerank_available:false`.
 *     We treat that TRUTHFULLY as "rerank not available": we do NOT export
 *     the URL and we shut the useless server down. NEVER fake health.
 *   - Spawn failures (python missing, immediate exit, health-check timeout)
 *     are caught and reported as "unavailable" — a sidecar problem NEVER
 *     takes the backend down.
 *
 * AUTH POSTURE:
 *   - The sidecar binds loopback-only by default (RERANK_HOST=127.0.0.1), so
 *     network reach is already constrained. All rerank traffic stays on-host.
 *
 * Resolution order (first match wins):
 *   1. `COLBERT_RERANK_URL` env already set → externally managed service; we
 *      do NOT spawn a second one — just report and trust the existing seam.
 *   2. Spawn: python interpreter (`COLBERT_PYTHON` env → `modules/memory/colbert/.venv`
 *      → `py/.venv` → first `python3` on PATH) + the repo entrypoint
 *      `<repo>/modules/memory/colbert/rerank_server.py`, bound to `COLBERT_RERANK_LISTEN`
 *      (default 127.0.0.1:8893 — the py server's own default port).
 *   3. Neither → resolve `undefined`; the conductor stays on the no-rerank path.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { createLogger } from '../logger.js';

const logger = createLogger('conductor:colbert-daemon');

/** The env var the existing consumer (`colbert-rerank.ts`) reads per-call. */
export const COLBERT_URL_ENV = 'COLBERT_RERANK_URL';

/** Env var an operator can use to point at a specific python interpreter. */
export const COLBERT_PYTHON_ENV = 'COLBERT_PYTHON';

/**
 * The loopback address the sidecar listens on. Overridable via
 * COLBERT_RERANK_LISTEN; the default port matches rerank_server.py's own
 * default (PORT=8893) so no extra config is required.
 */
const DEFAULT_LISTEN = '127.0.0.1:8893';

/**
 * How long to wait for the sidecar's /health on boot (ms). Read lazily (not
 * at module load) so tests can shrink it. Default is generous because the
 * flask process imports torch at module load when the deps are present.
 */
function healthWaitMs(): number {
  return Number(process.env.COLBERT_DAEMON_WAIT_MS) || 30_000;
}

/** Poll interval while waiting for the health endpoint to come up (ms). */
const HEALTH_POLL_MS = 100;

/** Backoff caps (ms) for auto-restart after sidecar exit. */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

/**
 * Walk up from this module to the repo root (the dir holding
 * `modules/memory/colbert/rerank_server.py`). Returns undefined if not found within a
 * bounded number of parents (never loops).
 */
function findRepoRoot(): string | undefined {
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return undefined;
  }
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'py', 'colbert', 'rerank_server.py'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve a python interpreter WITHOUT installing anything. Returns the first
 * existing candidate, or undefined when none is present (the degrade-safe
 * default — the conductor then stays on the no-rerank path).
 */
export function resolveColbertPython(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[COLBERT_PYTHON_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const candidates: string[] = [];
  const root = findRepoRoot();
  if (root) {
    // Prefer a project venv (where torch/colbert would actually be installed).
    candidates.push(
      join(root, 'py', 'colbert', '.venv', 'bin', 'python3'),
      join(root, 'py', 'colbert', '.venv', 'bin', 'python'),
      join(root, 'py', '.venv', 'bin', 'python3'),
      join(root, 'py', '.venv', 'bin', 'python'),
    );
  }
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'python3'));
  }
  return candidates.find((p) => existsSync(p));
}

/** Resolve the rerank entrypoint script, or undefined when absent. */
export function resolveColbertEntrypoint(): string | undefined {
  const root = findRepoRoot();
  if (!root) return undefined;
  const entry = join(root, 'py', 'colbert', 'rerank_server.py');
  return existsSync(entry) ? entry : undefined;
}

interface HealthProbe {
  readonly up: boolean;
  /** rerank_server.py's truthful dep report; undefined when unparsable. */
  readonly rerankAvailable?: boolean;
}

/** Poll the sidecar's GET /health until it responds 200 or the deadline passes. */
async function waitForHealth(url: string, deadlineMs: number): Promise<HealthProbe> {
  const start = Date.now();
  for (;;) {
    try {
      const resp = await (globalThis.fetch as typeof fetch)(`${url}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (resp.ok) {
        let rerankAvailable: boolean | undefined;
        try {
          const body = (await resp.json()) as { rerank_available?: unknown };
          if (typeof body?.rerank_available === 'boolean') {
            rerankAvailable = body.rerank_available;
          }
        } catch {
          // 200 without a parsable body — treat as up, availability unknown.
        }
        return { up: true, rerankAvailable };
      }
    } catch {
      // Not up yet — keep polling.
    }
    if (Date.now() - start >= deadlineMs) return { up: false };
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

export interface ColbertDaemonHandle {
  /** How the seam was satisfied: an operator-managed URL, or our subprocess. */
  readonly mode: 'external' | 'spawned';
  /** The rerank base URL (e.g. "http://127.0.0.1:8893"). */
  readonly url: string;
  /** The python interpreter that was spawned (spawned mode only). */
  readonly pythonBin?: string;
  /** The entrypoint script that was spawned (spawned mode only). */
  readonly entrypoint?: string;
  /** The spawned child process (spawned mode only; kept for lifecycle). */
  readonly child?: ChildProcess;
}

let started: Promise<ColbertDaemonHandle | undefined> | undefined;
let handle: ColbertDaemonHandle | undefined;
/** True when WE set COLBERT_RERANK_URL (never clobber an operator's value). */
let envExported = false;
/** Set before an intentional kill so the exit handler skips the restart loop. */
let suppressRestart = false;

/**
 * Ensure the colbert rerank sidecar is running (idempotent). Resolution order:
 * external `COLBERT_RERANK_URL` → spawn python3 + rerank_server.py → degrade
 * to undefined. On a successful spawn it exports `COLBERT_RERANK_URL` so the
 * existing `colbertRerank` consumer (which reads the env per-call) connects.
 * Resolves to `undefined` — never throws — on every failure path, so the
 * conductor degrades to the identity (no-rerank) order. NEVER fakes health.
 */
export function ensureColbertDaemon(): Promise<ColbertDaemonHandle | undefined> {
  if (started) return started;
  started = startColbertDaemon();
  return started;
}

async function startColbertDaemon(): Promise<ColbertDaemonHandle | undefined> {
  // Under the test runner we do NOT auto-spawn the sidecar: a background child
  // process would make test assertions non-deterministic. A test that
  // specifically exercises the daemon opts in with COLBERT_DAEMON_FORCE=1.
  if (process.env.NODE_ENV === 'test' && process.env.COLBERT_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // 1. Externally managed service: trust the existing seam, do not spawn.
  const externalUrl = process.env[COLBERT_URL_ENV]?.trim();
  if (externalUrl) {
    const url = externalUrl.replace(/\/+$/, '');
    logger.info(
      { url },
      `colbert rerank is externally managed (${COLBERT_URL_ENV} set) — connecting, not spawning`,
    );
    handle = { mode: 'external', url };
    return handle;
  }

  // 2. Spawn our own: python interpreter + repo entrypoint.
  const pythonBin = resolveColbertPython();
  if (!pythonBin) {
    logger.info(
      'python3 not found — staying on the no-rerank path (degrade-safe). ' +
        `Set ${COLBERT_PYTHON_ENV} or install python3 to enable the ColBERT rerank sidecar.`,
    );
    return undefined;
  }
  const entrypoint = resolveColbertEntrypoint();
  if (!entrypoint) {
    logger.info(
      'modules/memory/colbert/rerank_server.py not found — staying on the no-rerank path (degrade-safe).',
    );
    return undefined;
  }

  const listenAddr = process.env.COLBERT_RERANK_LISTEN?.trim() || DEFAULT_LISTEN;
  return spawnColbert(pythonBin, entrypoint, listenAddr, 0);
}

async function spawnColbert(
  pythonBin: string,
  entrypoint: string,
  listenAddr: string,
  attempt: number,
): Promise<ColbertDaemonHandle | undefined> {
  const [host, portStr] = listenAddr.split(':');
  const url = `http://${listenAddr}`;
  try {
    const child = spawn(pythonBin, [entrypoint], {
      // rerank_server.py reads RERANK_HOST + PORT; cwd is modules/memory/colbert so the
      // vendored `colbert` package resolves without installation.
      env: {
        ...process.env,
        RERANK_HOST: host || '127.0.0.1',
        PORT: portStr || '8893',
      },
      cwd: dirname(entrypoint),
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false,
    });

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      if (suppressRestart) {
        // Intentional shutdown (deps-unavailable teardown or stop()) — no loop.
        suppressRestart = false;
        return;
      }
      exitedEarly = handle === undefined; // exited before we adopted it
      logger.warn(
        { code, signal, pythonBin, entrypoint, listenAddr, attempt },
        'colbert rerank sidecar exited — will supervise with backoff',
      );
      handle = undefined;
      if (envExported) {
        // Truthful availability: only advertise the URL while the sidecar is up.
        delete process.env[COLBERT_URL_ENV];
        envExported = false;
      }

      // Supervised restart with exponential backoff, capped.
      if (process.env.NODE_ENV !== 'test') {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        logger.info(
          { backoffMs, attempt: attempt + 1 },
          'colbert rerank sidecar restarting after backoff',
        );
        setTimeout(() => {
          void spawnColbert(pythonBin, entrypoint, listenAddr, attempt + 1).then((h) => {
            if (h) {
              started = Promise.resolve(h);
            }
          });
        }, backoffMs);
      }
    });

    child.once('error', (err) => {
      logger.warn({ err, pythonBin }, 'colbert rerank sidecar spawn error — staying on no-rerank path');
    });

    // Surface the sidecar's own startup diagnostics at debug level.
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ sidecar: line }, 'colbert rerank sidecar stderr');
    });

    if (typeof child.unref === 'function') {
      // Do not keep the Node process alive solely for the sidecar child.
      child.unref();
    }

    const probe = await waitForHealth(url, healthWaitMs());
    if (!probe.up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { pythonBin, entrypoint, listenAddr, exitCode: child.exitCode, attempt },
        'colbert rerank sidecar did not pass health check in time — staying on no-rerank path ' +
          '(is the port free? Try COLBERT_RERANK_LISTEN=127.0.0.1:8894 if 8893 is taken)',
      );
      suppressRestart = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    if (probe.rerankAvailable === false) {
      // The flask shell is up but torch/colbert deps are absent: every /rerank
      // would 503. Truthful degrade: do NOT export the URL, shut the shell down.
      logger.warn(
        { pythonBin, entrypoint },
        'colbert rerank sidecar booted WITHOUT torch/colbert deps (rerank_available:false) — ' +
          'shutting it down and staying on no-rerank path. Install modules/memory/colbert deps ' +
          '(torch + the vendored colbert package) to enable late-interaction rerank.',
      );
      suppressRestart = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    // Export the URL the existing consumer (`colbertRerank`) reads per-call —
    // set BEFORE any consumer runs a rerank, and only because it was unset
    // (the external branch already returned when an operator set it).
    process.env[COLBERT_URL_ENV] = url;
    envExported = true;

    handle = { mode: 'spawned', url, pythonBin, entrypoint, child };
    logger.info(
      { pythonBin, entrypoint, url },
      'colbert rerank sidecar spawned — late-interaction rerank seam connected ' +
        '(first /rerank call may download the ColBERT checkpoint)',
    );
    return handle;
  } catch (err) {
    logger.warn(
      { err, pythonBin, entrypoint },
      'failed to spawn colbert rerank sidecar — staying on no-rerank path (degrade-safe)',
    );
    return undefined;
  }
}

/** The live handle, if the seam is connected (read-only inspection / health). */
export function colbertDaemonHandle(): ColbertDaemonHandle | undefined {
  return handle;
}

/** Stop the spawned sidecar (best-effort) and reset the seam. Idempotent. */
export function stopColbertDaemon(): void {
  const h = handle;
  handle = undefined;
  started = undefined;
  if (envExported) {
    delete process.env[COLBERT_URL_ENV];
    envExported = false;
  }
  if (h?.child) {
    suppressRestart = true;
    try {
      h.child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
  }
}

/** Test seam: reset the memoized start state without touching a running sidecar. */
export function __resetColbertDaemonForTest(): void {
  if (envExported) {
    delete process.env[COLBERT_URL_ENV];
    envExported = false;
  }
  handle = undefined;
  started = undefined;
  suppressRestart = false;
}
