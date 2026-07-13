/**
 * ops-recorder work-signals sidecar spawn seam — supervise
 * `py/ops-recorder/work-signals/main.py` (the FastAPI stuck-work detector)
 * as an app-owned loopback subprocess, mirroring the proven
 * `colbert-daemon.ts` pattern (resolve → spawn → wait-for-health →
 * auto-restart with capped backoff → degrade-safe).
 *
 * FUSION MODE (RECODER-DEEP-FUSION-PLAN.md §py/ops-recorder "keep/supervise"):
 * `py/ops-recorder` was an HTTP-URL seam — something external had to start it
 * and export `OPS_RECORDER_URL`. This module makes docker-backend the owner:
 * it spawns and supervises the Python process itself and exports the URL the
 * existing consumer (`conductor/ops-recorder-adapter.ts`, which reads
 * `OPS_RECORDER_URL` lazily per-call) already understands. No consumer
 * changes needed.
 *
 * DEGRADE-SAFE BY CONSTRUCTION:
 *   - We NEVER install Python deps here. If python3 or the entrypoint is
 *     absent, `ensure()` resolves to `undefined` and the inline
 *     `/work-signals` ingest keeps working alone — `forwardToOpsRecorder`
 *     already degrades when the URL is unset.
 *   - The py service requires `OPS_RECORDER_API_KEY` for every non-health
 *     endpoint (503 otherwise) unless `OPS_RECORDER_AUTH_DISABLED` is set.
 *     Booting it without either would be a useless shell — every forward
 *     would 503. We treat that TRUTHFULLY as "not available": we do NOT
 *     spawn and we log exactly what the operator must set. NEVER fake health.
 *   - Spawn failures (python missing, deps missing → immediate exit,
 *     health-check timeout) are caught and reported as "unavailable" — a
 *     sidecar problem NEVER takes the backend down.
 *
 * AUTH POSTURE:
 *   - The sidecar binds loopback-only by default (127.0.0.1), so network
 *     reach is already constrained. All work-signal traffic stays on-host.
 *   - The spawned child inherits `OPS_RECORDER_API_KEY` /
 *     `OPS_RECORDER_AUTH_DISABLED` from the backend env — the same values the
 *     forwarding consumer (`work-signals.ts`) sends per-call.
 *
 * Resolution order (first match wins):
 *   1. `OPS_RECORDER_URL` env already set → externally managed service; we
 *      do NOT spawn a second one — just report and trust the existing seam.
 *   2. Spawn: python interpreter (`OPS_RECORDER_PYTHON` env →
 *      `py/ops-recorder/work-signals/.venv` → `py/ops-recorder/.venv` →
 *      `py/.venv` → first `python3` on PATH) running
 *      `python -m uvicorn main:app` from `<repo>/py/ops-recorder/work-signals`,
 *      bound to `OPS_RECORDER_LISTEN` (default 127.0.0.1:8073 — the fleet
 *      manifest's canonical ops-recorder port).
 *   3. Neither → resolve `undefined`; the inline ingest stays forward-free.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { createLogger } from '../logger.js';

const logger = createLogger('conductor:ops-recorder-daemon');

/** The env var the existing consumer (`ops-recorder-adapter.ts`) reads per-call. */
export const OPS_RECORDER_URL_ENV = 'OPS_RECORDER_URL';

/** Env var an operator can use to point at a specific python interpreter. */
export const OPS_RECORDER_PYTHON_ENV = 'OPS_RECORDER_PYTHON';

/**
 * The loopback address the sidecar listens on. Overridable via
 * OPS_RECORDER_LISTEN; the default port matches the fleet manifest's
 * canonical ops-recorder endpoint (http://127.0.0.1:8073) so no extra
 * config is required.
 */
const DEFAULT_LISTEN = '127.0.0.1:8073';

/**
 * How long to wait for the sidecar's /health on boot (ms). Read lazily (not
 * at module load) so tests can shrink it. FastAPI/uvicorn boots fast, but the
 * service may probe Postgres during startup, so allow headroom.
 */
function healthWaitMs(): number {
  return Number(process.env.OPS_RECORDER_DAEMON_WAIT_MS) || 20_000;
}

/** Poll interval while waiting for the health endpoint to come up (ms). */
const HEALTH_POLL_MS = 100;

/** Backoff caps (ms) for auto-restart after sidecar exit. */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

/** Repo-relative path of the work-signals service directory. */
const SERVICE_REL_PATH = ['py', 'ops-recorder', 'work-signals'] as const;

/**
 * Walk up from this module to the repo root (the dir holding
 * `py/ops-recorder/work-signals/main.py`). Returns undefined if not found
 * within a bounded number of parents (never loops).
 */
function findRepoRoot(): string | undefined {
  let dir: string;
  try {
    dir = __dirname;
  } catch {
    return undefined;
  }
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, ...SERVICE_REL_PATH, 'main.py'))) {
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
 * default — the inline ingest then stays forward-free).
 */
export function resolveOpsRecorderPython(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env[OPS_RECORDER_PYTHON_ENV]?.trim();
  if (explicit) {
    return existsSync(explicit) ? explicit : undefined;
  }
  const candidates: string[] = [];
  const root = findRepoRoot();
  if (root) {
    // Prefer a project venv (where fastapi/uvicorn would actually be installed).
    candidates.push(
      join(root, ...SERVICE_REL_PATH, '.venv', 'bin', 'python3'),
      join(root, ...SERVICE_REL_PATH, '.venv', 'bin', 'python'),
      join(root, 'py', 'ops-recorder', '.venv', 'bin', 'python3'),
      join(root, 'py', 'ops-recorder', '.venv', 'bin', 'python'),
      join(root, 'py', '.venv', 'bin', 'python3'),
      join(root, 'py', '.venv', 'bin', 'python'),
    );
  }
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'python3'));
  }
  return candidates.find((p) => existsSync(p));
}

/** Resolve the work-signals entrypoint script, or undefined when absent. */
export function resolveOpsRecorderEntrypoint(): string | undefined {
  const root = findRepoRoot();
  if (!root) return undefined;
  const entry = join(root, ...SERVICE_REL_PATH, 'main.py');
  return existsSync(entry) ? entry : undefined;
}

/** Poll the sidecar's GET /health until it responds 200 or the deadline passes. */
async function waitForHealth(url: string, deadlineMs: number): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    try {
      const resp = await (globalThis.fetch as typeof fetch)(`${url}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (resp.ok) return true;
    } catch {
      // Not up yet — keep polling.
    }
    if (Date.now() - start >= deadlineMs) return false;
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_MS));
  }
}

export interface OpsRecorderDaemonHandle {
  /** How the seam was satisfied: an operator-managed URL, or our subprocess. */
  readonly mode: 'external' | 'spawned';
  /** The ops-recorder base URL (e.g. "http://127.0.0.1:8073"). */
  readonly url: string;
  /** The python interpreter that was spawned (spawned mode only). */
  readonly pythonBin?: string;
  /** The entrypoint script that was spawned (spawned mode only). */
  readonly entrypoint?: string;
  /** The spawned child process (spawned mode only; kept for lifecycle). */
  readonly child?: ChildProcess;
}

let started: Promise<OpsRecorderDaemonHandle | undefined> | undefined;
let handle: OpsRecorderDaemonHandle | undefined;
/** True when WE set OPS_RECORDER_URL (never clobber an operator's value). */
let envExported = false;
/** Set before an intentional kill so the exit handler skips the restart loop. */
let suppressRestart = false;

/**
 * Ensure the ops-recorder work-signals sidecar is running (idempotent).
 * Resolution order: external `OPS_RECORDER_URL` → spawn python3 + uvicorn
 * main:app → degrade to undefined. On a successful spawn it exports
 * `OPS_RECORDER_URL` so the existing `forwardToOpsRecorder` consumer (which
 * reads the env per-call) connects. Resolves to `undefined` — never throws —
 * on every failure path, so the inline `/work-signals` ingest keeps working
 * without the forward. NEVER fakes health.
 */
export function ensureOpsRecorderDaemon(): Promise<OpsRecorderDaemonHandle | undefined> {
  if (started) return started;
  started = startOpsRecorderDaemon();
  return started;
}

async function startOpsRecorderDaemon(): Promise<OpsRecorderDaemonHandle | undefined> {
  // Under the test runner we do NOT auto-spawn the sidecar: a background child
  // process would make test assertions non-deterministic. A test that
  // specifically exercises the daemon opts in with OPS_RECORDER_DAEMON_FORCE=1.
  if (process.env.NODE_ENV === 'test' && process.env.OPS_RECORDER_DAEMON_FORCE !== '1') {
    return undefined;
  }

  // 1. Externally managed service: trust the existing seam, do not spawn.
  const externalUrl = process.env[OPS_RECORDER_URL_ENV]?.trim();
  if (externalUrl) {
    const url = externalUrl.replace(/\/+$/, '');
    logger.info(
      { url },
      `ops-recorder is externally managed (${OPS_RECORDER_URL_ENV} set) — connecting, not spawning`,
    );
    handle = { mode: 'external', url };
    return handle;
  }

  // 2. Auth preflight — truthful degrade BEFORE spawning a useless shell.
  //    The py service 503s every non-health endpoint without an API key
  //    (config.py::require_api_key), so a keyless spawn could never serve a
  //    single forward. NEVER fake availability.
  const authDisabled = /^(1|true|yes)$/i.test(
    process.env.OPS_RECORDER_AUTH_DISABLED?.trim() ?? '',
  );
  if (!process.env.OPS_RECORDER_API_KEY?.trim() && !authDisabled) {
    logger.info(
      'OPS_RECORDER_API_KEY not set — staying on the no-forward path (degrade-safe). ' +
        'Set OPS_RECORDER_API_KEY (or OPS_RECORDER_AUTH_DISABLED=1 for loopback-only dev) ' +
        'to enable the ops-recorder work-signals sidecar.',
    );
    return undefined;
  }

  // 3. Spawn our own: python interpreter + repo entrypoint.
  const pythonBin = resolveOpsRecorderPython();
  if (!pythonBin) {
    logger.info(
      'python3 not found — staying on the no-forward path (degrade-safe). ' +
        `Set ${OPS_RECORDER_PYTHON_ENV} or install python3 to enable the ops-recorder sidecar.`,
    );
    return undefined;
  }
  const entrypoint = resolveOpsRecorderEntrypoint();
  if (!entrypoint) {
    logger.info(
      'py/ops-recorder/work-signals/main.py not found — staying on the no-forward path (degrade-safe).',
    );
    return undefined;
  }

  const listenAddr = process.env.OPS_RECORDER_LISTEN?.trim() || DEFAULT_LISTEN;
  return spawnOpsRecorder(pythonBin, entrypoint, listenAddr, 0);
}

async function spawnOpsRecorder(
  pythonBin: string,
  entrypoint: string,
  listenAddr: string,
  attempt: number,
): Promise<OpsRecorderDaemonHandle | undefined> {
  const [host, portStr] = listenAddr.split(':');
  const url = `http://${listenAddr}`;
  try {
    // `python -m uvicorn main:app` (NOT `python main.py`) — main.py's dev
    // runner hardcodes reload=True, which adds a file-watcher supervisor we
    // do not want under app-owned supervision. cwd is the service dir so the
    // relative `api/`, `storage/`, `config` imports resolve.
    const child = spawn(
      pythonBin,
      ['-m', 'uvicorn', 'main:app', '--host', host || '127.0.0.1', '--port', portStr || '8073'],
      {
        env: { ...process.env },
        cwd: dirname(entrypoint),
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: false,
      },
    );

    let exitedEarly = false;
    child.once('exit', (code, signal) => {
      if (suppressRestart) {
        // Intentional shutdown (health-timeout teardown or stop()) — no loop.
        suppressRestart = false;
        return;
      }
      exitedEarly = handle === undefined; // exited before we adopted it
      logger.warn(
        { code, signal, pythonBin, entrypoint, listenAddr, attempt },
        'ops-recorder sidecar exited — will supervise with backoff',
      );
      handle = undefined;
      if (envExported) {
        // Truthful availability: only advertise the URL while the sidecar is up.
        delete process.env[OPS_RECORDER_URL_ENV];
        envExported = false;
      }

      // Supervised restart with exponential backoff, capped.
      if (process.env.NODE_ENV !== 'test') {
        const backoffMs = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        logger.info(
          { backoffMs, attempt: attempt + 1 },
          'ops-recorder sidecar restarting after backoff',
        );
        setTimeout(() => {
          void spawnOpsRecorder(pythonBin, entrypoint, listenAddr, attempt + 1).then((h) => {
            if (h) {
              started = Promise.resolve(h);
            }
          });
        }, backoffMs);
      }
    });

    child.once('error', (err) => {
      logger.warn({ err, pythonBin }, 'ops-recorder sidecar spawn error — staying on no-forward path');
    });

    // Surface the sidecar's own startup diagnostics at debug level.
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) logger.debug({ sidecar: line }, 'ops-recorder sidecar stderr');
    });

    if (typeof child.unref === 'function') {
      // Do not keep the Node process alive solely for the sidecar child.
      child.unref();
    }

    const up = await waitForHealth(url, healthWaitMs());
    if (!up || exitedEarly || child.exitCode !== null) {
      logger.warn(
        { pythonBin, entrypoint, listenAddr, exitCode: child.exitCode, attempt },
        'ops-recorder sidecar did not pass health check in time — staying on no-forward path ' +
          '(deps installed? Try `pip install -r py/ops-recorder/work-signals/requirements.txt`; ' +
          'port free? Try OPS_RECORDER_LISTEN=127.0.0.1:8074 if 8073 is taken)',
      );
      suppressRestart = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }

    // Export the URL the existing consumer (`forwardToOpsRecorder`) reads
    // per-call — set BEFORE any forward runs, and only because it was unset
    // (the external branch already returned when an operator set it).
    process.env[OPS_RECORDER_URL_ENV] = url;
    envExported = true;

    handle = { mode: 'spawned', url, pythonBin, entrypoint, child };
    logger.info(
      { pythonBin, entrypoint, url },
      'ops-recorder sidecar spawned — work-signals forward seam connected',
    );
    return handle;
  } catch (err) {
    logger.warn(
      { err, pythonBin, entrypoint },
      'failed to spawn ops-recorder sidecar — staying on no-forward path (degrade-safe)',
    );
    return undefined;
  }
}

/** The live handle, if the seam is connected (read-only inspection / health). */
export function opsRecorderDaemonHandle(): OpsRecorderDaemonHandle | undefined {
  return handle;
}

/** Stop the spawned sidecar (best-effort) and reset the seam. Idempotent. */
export function stopOpsRecorderDaemon(): void {
  const h = handle;
  handle = undefined;
  started = undefined;
  if (envExported) {
    delete process.env[OPS_RECORDER_URL_ENV];
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
export function __resetOpsRecorderDaemonForTest(): void {
  if (envExported) {
    delete process.env[OPS_RECORDER_URL_ENV];
    envExported = false;
  }
  handle = undefined;
  started = undefined;
  suppressRestart = false;
}
