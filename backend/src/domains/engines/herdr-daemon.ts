/**
 * herdr-daemon — a supervised manager for the vendored `herdr server` sidecar.
 *
 * herdr (apps/desktop/engines/herdr, Apache-2.0) runs a headless server exposing
 * an NDJSON Unix-socket control API (PROTOCOL_VERSION 20). The conductor drives
 * it as a third execution substrate beside `tmux_worktree` and `acp`
 * (docs/HERDR-INTEGRATION.md §Phase 2). This module owns that server process the
 * way `openfang-daemon.ts` / `colbert-daemon.ts` own theirs: resolve the binary →
 * spawn `herdr server` on a RECODER-OWNED socket path with a denylist-stripped env
 * → poll the socket + a real `ping` (protocol 20) until healthy or a bounded
 * timeout → expose that socket path so `createHerdrSubstrate` can be constructed
 * against it → signal the whole process group on `stop()`.
 *
 * TRUTHFUL BY CONSTRUCTION:
 *   - The binary absent ⇒ `start()` returns `{ running:false, reason }` and NEVER
 *     spawns a phantom; the substrate then reports unavailable with that reason.
 *   - Health is a REAL `ping` handshake (protocol 20), never the mere existence of
 *     a child pid — a server that never binds its socket is reported down.
 *   - A spawn error / early exit / health timeout is caught and reported as down;
 *     a sidecar problem NEVER throws out of `start()`.
 *
 * SECURITY: the `herdr` daemon (and every agent it hosts) must NOT inherit the
 * backend's secrets. The spawn env is the base env with known backend secrets
 * DENYLIST-stripped — mirroring the acp substrate's `isSecretAgentEnvKey` handling
 * (kept local so the engines layer does not depend on a conductor adapter).
 *
 * RECODER-OWNED SOCKET: Recoder controls the socket path per-install (a state/temp
 * dir it owns), NOT `~/.config/herdr` — so a user-run herdr never collides with
 * the backend-supervised one. Resolve it at the composition edge with
 * {@link defaultRecoderHerdrSocketPath} and inject it (this module reads no env
 * for the path itself).
 *
 * PROCESS GROUP: herdr advertises a `detached_server_daemon` capability (it may
 * double-fork a detached daemon), so the direct child pid alone is not always the
 * live server. We spawn `detached` (own process group) and `stop()` signals the
 * WHOLE group (negative pid) — SIGTERM then SIGKILL — plus the direct pid, so no
 * orphan `herdr server` survives. A fully double-forked daemon that reparents out
 * of the group is honestly acknowledged (same caveat the Phase-1 smoke documents).
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HerdrSocketClient } from '@recoder/agent-runtimes/herdr';

import { createLogger } from '../../shared/logger.js';

const logger = createLogger('conductor:herdr-daemon');

/** herdr `PROTOCOL_VERSION` — a `ping` must handshake exactly this. */
export const HERDR_PROTOCOL_VERSION = 20;

/** Env var an operator can use to pin the Recoder-owned herdr socket path. */
export const HERDR_SOCKET_PATH_ENV = 'CONDUCTOR_HERDR_SOCKET_PATH';

/** Default bounded wait for the server to bind its socket + answer ping (ms). */
const DEFAULT_HEALTH_TIMEOUT_MS = 15_000;
/** Poll interval while waiting for the socket + health (ms). */
const DEFAULT_POLL_MS = 100;

/**
 * Backend-infrastructure secrets the herdr daemon (and the prompt-injectable
 * agents it hosts) have NO business inheriting — stripped from the spawn env.
 * MIRRORS `acp-substrate.adapter.ts`'s `SECRET_ENV_PATTERNS` (kept local so the
 * engines layer stays independent of the conductor adapter). Conservative by
 * design (denylist, not allowlist): infra/auth/billing/cloud secrets only, so the
 * daemon KEEPS what the agents need (PATH, HOME, ANTHROPIC_API_KEY / OPENAI_API_KEY,
 * GITHUB_TOKEN, locale).
 */
const SECRET_ENV_PATTERNS: readonly RegExp[] = [
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /PRIVATE_KEY/i,
  /DATABASE_URL/i,
  /^DIRECT_URL$/i,
  /^REDIS_URL$/i,
  /^INTERNAL_SERVICE_KEY$/i,
  /^API_KEY_HASH_SALT$/i,
  /^(POLAR|CREEM|PADDLE|DODO)_/i,
  /^(CLOUDFLARE|HETZNER|AWS|AZURE|DAYTONA|E2B)_/i,
];

/** Is this env key a known backend secret to withhold from the daemon/agents? */
export function isSecretHerdrEnvKey(key: string): boolean {
  return SECRET_ENV_PATTERNS.some(re => re.test(key));
}

/**
 * Resolve the RECODER-OWNED herdr socket path at the composition edge. Recoder
 * controls this per-install: `CONDUCTOR_HERDR_SOCKET_PATH` override → a state dir
 * Recoder owns (`RECODER_STATE_DIR`, else `<tmpdir>/recoder-herdr`). Deliberately
 * NOT `~/.config/herdr` (herdr's own default) so a user-run herdr never collides.
 */
export function defaultRecoderHerdrSocketPath(
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = env[HERDR_SOCKET_PATH_ENV]?.trim();
  if (explicit) return explicit;
  const stateDir = env.RECODER_STATE_DIR?.trim();
  const root =
    stateDir && stateDir.length > 0
      ? join(stateDir, 'herdr')
      : join(tmpdir(), 'recoder-herdr', safeUser());
  return join(root, 'herdr.sock');
}

/** A filesystem-safe per-user segment so two accounts never share a socket dir. */
function safeUser(): string {
  try {
    const base = homedir().split(/[\\/]/).pop() ?? 'default';
    return base.replace(/[^A-Za-z0-9_.-]/g, '_') || 'default';
  } catch {
    return 'default';
  }
}

/** Truthful snapshot of the daemon's supervised state. */
export interface HerdrDaemonStatus {
  /** True ONLY after a real `ping` handshake (protocol 20) succeeded. */
  readonly running: boolean;
  /** The Recoder-owned socket path the server was told to bind. */
  readonly socketPath: string;
  /** The direct child pid (present while a server process is tracked). */
  readonly pid?: number;
  /** The resolved binary that was spawned. */
  readonly bin?: string;
  /** The handshaked protocol version (present when running). */
  readonly protocol?: number;
  /** Present when `running` is false: why the daemon is not up. */
  readonly reason?: string;
}

/** The minimal child surface this manager depends on (real ChildProcess fits). */
export interface HerdrChild {
  readonly pid?: number;
  readonly stderr: {
    on(event: 'data', cb: (chunk: Buffer | string) => void): void;
  } | null;
  on(event: 'exit', cb: (code: number | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
  unref?(): void;
}

/** The low-level spawn seam (defaults to node's; tests inject a fake). */
export type HerdrSpawn = (
  bin: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) => HerdrChild;

/** The narrow client slice this manager drives for the health handshake. */
export interface HerdrPingClient {
  ping(): Promise<{ protocol: number; version?: string }>;
}

const defaultSpawn: HerdrSpawn = (bin, args, env) =>
  nodeSpawn(bin, [...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group so `stop()` can signal a forked daemon too.
    detached: true,
  }) as unknown as HerdrChild;

export interface CreateHerdrDaemonDeps {
  /** The RECODER-OWNED socket path (injected; see {@link defaultRecoderHerdrSocketPath}). */
  readonly socketPath: string;
  /** Resolve the herdr binary; defaults to {@link resolveHerdrBin} over `process.env`. */
  readonly resolveBin: () => { bin: string | null; reason?: string };
  /** The base env the daemon inherits (default `process.env`), secret-stripped before spawn. */
  readonly env?: NodeJS.ProcessEnv;
  /** Override the "is this a backend secret?" predicate (default {@link isSecretHerdrEnvKey}). */
  readonly isSecretEnvKey?: (key: string) => boolean;
  /** Low-level spawn seam (default: node child_process). */
  readonly spawn?: HerdrSpawn;
  /** Build the health-probe client for a socket path (default: a real HerdrSocketClient). */
  readonly makeClient?: (socketPath: string) => HerdrPingClient;
  /** Filesystem-existence probe for the socket file (default `existsSync`). */
  readonly exists?: (p: string) => boolean;
  /** Bounded wait for socket + health (ms). */
  readonly healthTimeoutMs?: number;
  /** Poll interval while waiting (ms). */
  readonly pollIntervalMs?: number;
}

/** A supervised herdr server: `start()` → `ping`-gated health, `stop()` → group kill. */
export interface HerdrDaemon {
  /** The Recoder-owned socket path the substrate is constructed against. */
  readonly socketPath: string;
  /** Spawn + health-probe the server (idempotent while healthy). Never throws. */
  start(): Promise<HerdrDaemonStatus>;
  /** Signal the whole process group (SIGTERM→SIGKILL) + remove the socket. Idempotent. */
  stop(): Promise<void>;
  /** Last known status (sync snapshot; `running:false` until a successful `start`). */
  status(): HerdrDaemonStatus;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the spawn env: the base env (injected or `process.env`) with backend
 * secrets DENYLIST-stripped, plus `HERDR_SOCKET_PATH` pinned to the Recoder-owned
 * path so the server binds where the substrate expects it.
 */
function buildDaemonEnv(
  base: NodeJS.ProcessEnv,
  socketPath: string,
  isSecret: (key: string) => boolean
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && !isSecret(key)) out[key] = value;
  }
  out.HERDR_SOCKET_PATH = socketPath;
  return out;
}

/**
 * Create a supervised herdr daemon over an injected Recoder-owned socket path.
 * Everything touching the OS (bin resolution, spawn, client, fs) is injectable so
 * the lifecycle is unit-tested against a fake `herdr server` script.
 */
export function createHerdrDaemon(deps: CreateHerdrDaemonDeps): HerdrDaemon {
  const socketPath = deps.socketPath;
  if (!socketPath) {
    throw new Error('createHerdrDaemon requires an injected socketPath');
  }
  const spawn = deps.spawn ?? defaultSpawn;
  const makeClient =
    deps.makeClient ?? ((p: string) => new HerdrSocketClient({ socketPath: p }));
  const exists = deps.exists ?? existsSync;
  const isSecret = deps.isSecretEnvKey ?? isSecretHerdrEnvKey;
  const healthTimeoutMs = deps.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS;

  let child: HerdrChild | null = null;
  let starting: Promise<HerdrDaemonStatus> | null = null;
  let current: HerdrDaemonStatus = {
    running: false,
    socketPath,
    reason: 'herdr daemon not started',
  };

  /** Kill the tracked server's whole process group, then its direct pid. */
  function killTracked(): void {
    const c = child;
    child = null;
    if (c?.pid == null) return;
    for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
      try {
        process.kill(-c.pid, sig);
      } catch {
        /* group already gone */
      }
      try {
        process.kill(c.pid, sig);
      } catch {
        /* pid already gone */
      }
    }
  }

  async function waitForHealthy(
    client: HerdrPingClient,
    childExited: () => boolean
  ): Promise<{ ok: true; protocol: number } | { ok: false; reason: string }> {
    const deadline = Date.now() + healthTimeoutMs;
    for (;;) {
      if (childExited()) {
        return { ok: false, reason: 'herdr server exited before becoming healthy' };
      }
      if (exists(socketPath)) {
        try {
          const pong = await client.ping();
          if (pong.protocol === HERDR_PROTOCOL_VERSION) {
            return { ok: true, protocol: pong.protocol };
          }
          return {
            ok: false,
            reason: `herdr protocol ${pong.protocol}, expected ${HERDR_PROTOCOL_VERSION}`,
          };
        } catch (err) {
          // A protocol mismatch is fatal (the client rejects it); everything else
          // (ECONNREFUSED / not-yet-listening) just means keep polling.
          const code = (err as { code?: unknown })?.code;
          if (code === 'protocol_mismatch') {
            return { ok: false, reason: message(err) };
          }
        }
      }
      if (Date.now() >= deadline) {
        return {
          ok: false,
          reason: `herdr did not become healthy within ${healthTimeoutMs}ms`,
        };
      }
      await delay(pollIntervalMs);
    }
  }

  async function doStart(): Promise<HerdrDaemonStatus> {
    const resolved = deps.resolveBin();
    if (resolved.bin == null) {
      current = {
        running: false,
        socketPath,
        reason: resolved.reason ?? 'herdr binary not found',
      };
      logger.info({ socketPath, reason: current.reason }, 'herdr daemon not started (binary absent)');
      return current;
    }
    const bin = resolved.bin;

    // Fresh socket: a stale file from a prior crash must not fool the health poll.
    try {
      mkdirSync(dirname(socketPath), { recursive: true });
      rmSync(socketPath, { force: true });
    } catch (err) {
      logger.warn({ socketPath, err: message(err) }, 'herdr socket pre-clean failed (continuing)');
    }

    const env = buildDaemonEnv(deps.env ?? process.env, socketPath, isSecret);

    let spawned: HerdrChild;
    try {
      spawned = spawn(bin, ['server'], env);
    } catch (err) {
      current = {
        running: false,
        socketPath,
        bin,
        reason: `herdr spawn failed: ${message(err)}`,
      };
      logger.warn({ bin, err: message(err) }, 'herdr server spawn threw');
      return current;
    }
    child = spawned;

    let exited = false;
    let spawnErr: string | undefined;
    let stderrTail = '';
    spawned.on('exit', () => {
      exited = true;
    });
    spawned.on('error', err => {
      exited = true;
      spawnErr = message(err);
    });
    spawned.stderr?.on('data', chunk => {
      stderrTail = (stderrTail + chunk.toString()).slice(-800);
    });
    // Do not keep the backend alive solely for the sidecar.
    spawned.unref?.();

    const client = makeClient(socketPath);
    const health = await waitForHealthy(client, () => exited);

    if (!health.ok) {
      const detail = spawnErr ?? stderrTail.trim();
      const reason = detail ? `${health.reason} (${detail.slice(0, 300)})` : health.reason;
      killTracked();
      current = { running: false, socketPath, bin, reason };
      logger.warn({ bin, socketPath, reason }, 'herdr daemon failed health check');
      return current;
    }

    current = {
      running: true,
      socketPath,
      pid: spawned.pid,
      bin,
      protocol: health.protocol,
    };
    logger.info(
      { bin, socketPath, pid: spawned.pid, protocol: health.protocol },
      'herdr daemon healthy (ping handshaked)'
    );
    return current;
  }

  return {
    socketPath,

    async start(): Promise<HerdrDaemonStatus> {
      // Idempotent while healthy; a prior failure is retryable.
      if (current.running && child) return current;
      if (starting) return starting;
      starting = doStart().finally(() => {
        starting = null;
      });
      return starting;
    },

    async stop(): Promise<void> {
      killTracked();
      try {
        rmSync(socketPath, { force: true });
      } catch {
        /* best-effort */
      }
      current = {
        running: false,
        socketPath,
        reason: 'herdr daemon stopped',
      };
    },

    status(): HerdrDaemonStatus {
      return current;
    },
  };
}
