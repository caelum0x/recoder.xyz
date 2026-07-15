/**
 * `daemon-kernel.adapter` — the UDS daemon kernel rung. It spawns/connects the
 * PREBUILT `recoder-governance-daemon` binary
 * (`backend/engines/rust/recoder-governance`) and hands its socket to
 * `@recoder/governance`'s facade so `decide()` delegates to the real Rust kernel
 * over a length-prefixed-JSON Unix-domain socket.
 *
 * PORTED from the reuse target `conductor/governance-daemon.ts` (moved behind
 * this adapter; the original stays until the serial integration step retires
 * it). DEGRADE-SAFE BY CONSTRUCTION:
 *   - The crate is NEVER built here. No prebuilt binary → `undefined` → the
 *     ladder degrades to the pure-TS rung.
 *   - Spawn faults (not executable, immediate exit, socket never appears) are
 *     caught and reported as unavailable — a daemon problem never crashes boot.
 *   - AUTH: the daemon refuses to start without `INTERNAL_SERVICE_KEY` unless
 *     `allowInsecureDaemon` (local dev). We pass the parent env through and never
 *     inject an insecure bypass in production.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, constants as fsConstants } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Governance } from '@recoder/governance';
import type { GovernanceKernelPort } from '../ports/kernel.port.js';
import type { GovernanceConfig } from '../config.js';
import { GovernanceBackedKernel } from './governance-kernel.js';

const DAEMON_BIN_NAME = 'recoder-governance-daemon';
const GOVERNANCE_DAEMON_ENV = 'RECODER_GOVERNANCE_DAEMON';
const GOVERNANCE_SOCKET_ENV = 'GOVERNANCE_SOCKET';
const SOCKET_WAIT_MS = Number(process.env.GOVERNANCE_DAEMON_WAIT_MS) || 3_000;
const SOCKET_POLL_MS = 50;

export interface GovernanceDaemonHandle {
  readonly socketPath: string;
  readonly binPath: string;
  readonly child: ChildProcess;
}

/** Walk up to the repo root (the dir holding the recoder-governance crate). */
function findRepoRoot(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, 'backend', 'engines', 'rust', 'recoder-governance', 'Cargo.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Resolve the prebuilt daemon binary WITHOUT building it. `undefined` when absent. */
export function resolveGovernanceDaemonBin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env[GOVERNANCE_DAEMON_ENV]?.trim();
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  const root = findRepoRoot();
  if (!root) return undefined;
  const base = path.join(root, 'backend', 'engines', 'rust', 'recoder-governance', 'target');
  return [path.join(base, 'release', DAEMON_BIN_NAME), path.join(base, 'debug', DAEMON_BIN_NAME)].find((p) => existsSync(p));
}

function defaultSocketPath(): string {
  return path.join(os.tmpdir(), `recoder-governance-${process.pid}.sock`);
}

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

let started: Promise<GovernanceDaemonHandle | undefined> | undefined;
let handle: GovernanceDaemonHandle | undefined;

/**
 * Ensure the governance daemon is running (idempotent). Returns `undefined` —
 * never throws — when no binary is present or it fails to come up (degrade to
 * the pure-TS path). A pre-set `GOVERNANCE_SOCKET` (externally-managed daemon) is
 * trusted, not duplicated.
 */
export function ensureGovernanceDaemon(cfg: GovernanceConfig): Promise<GovernanceDaemonHandle | undefined> {
  if (!started) started = startGovernanceDaemon(cfg);
  return started;
}

async function startGovernanceDaemon(cfg: GovernanceConfig): Promise<GovernanceDaemonHandle | undefined> {
  const preexisting = (cfg.daemonSocketPath ?? process.env[GOVERNANCE_SOCKET_ENV])?.trim();
  if (preexisting) return undefined; // externally managed — the facade connects directly

  const binPath = resolveGovernanceDaemonBin();
  if (!binPath) return undefined; // not built — degrade-safe default

  const socketPath = defaultSocketPath();
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, [GOVERNANCE_SOCKET_ENV]: socketPath };
    if (cfg.allowInsecureDaemon && !env.INTERNAL_SERVICE_KEY) env.GOVERNANCE_ALLOW_INSECURE = '1';
    const child = spawn(binPath, [], { env, stdio: ['ignore', 'ignore', 'pipe'], detached: false });

    let exitedEarly = false;
    child.once('exit', () => {
      exitedEarly = handle === undefined;
      handle = undefined;
    });
    child.once('error', () => {
      /* spawn error — stay on TS path */
    });
    if (typeof child.unref === 'function') child.unref();

    const up = await waitForSocket(socketPath, SOCKET_WAIT_MS);
    if (!up || exitedEarly || child.exitCode !== null) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      return undefined;
    }
    process.env[GOVERNANCE_SOCKET_ENV] = socketPath;
    handle = { socketPath, binPath, child };
    return handle;
  } catch {
    return undefined;
  }
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

/**
 * Build the UDS daemon kernel rung. Ensures a daemon (or trusts an external
 * socket), then constructs a `Governance` bound to it and PROBES it live — a
 * daemon that does not answer yields `undefined` so the ladder degrades to TS
 * (truthful, never a faked `up`). The crate is never built.
 */
export async function createDaemonKernelAdapter(cfg: GovernanceConfig): Promise<GovernanceKernelPort | undefined> {
  const external = (cfg.daemonSocketPath ?? process.env[GOVERNANCE_SOCKET_ENV])?.trim();
  const spawned = await ensureGovernanceDaemon(cfg);
  const socketPath = external || spawned?.socketPath;
  if (!socketPath) return undefined;
  try {
    const gov = await Governance.create({ auditEnabled: cfg.auditEnabled, daemonSocketPath: socketPath });
    const health = await gov.healthViaDaemon();
    if (health.daemon !== 'available') {
      gov.close();
      return undefined;
    }
    return new GovernanceBackedKernel(gov, 'daemon', `recoder-governance-daemon @ ${socketPath}`);
  } catch {
    return undefined;
  }
}
