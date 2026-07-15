/**
 * `DaemonSupervisor` — the ONE implementation that supervises every loopback
 * binary (Rust/Go daemon), folding the scattered
 * `conductor/{openfang,governance,colbert,ops-recorder}-daemon.ts` +
 * `engines/{multica,ziti}-client.ts` supervision into a single spec-driven class.
 *
 * Lifecycle: resolve → (skip-spawn when `externalUrl` set) → spawn once with a
 * MINIMAL env → wait for `/health` 200 within `waitMs` → adopt → restart with
 * capped backoff on unexpected exit. Loopback-only bind is ENFORCED
 * (`127.0.0.1`); a non-loopback listen addr is rejected. The child env is only
 * the configured keys + listen addr — NEVER the full `process.env`.
 *
 * DEGRADE-SAFE: an absent binary, a health-check timeout, or a spawn error all
 * resolve to `null` (never throw) and report `down` with a truthful reason.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import type { Logger } from '../../../shared/logger.js';
import {
  DAEMON_WAIT_MS,
  HEALTH_POLL_MS,
  PROBE_TIMEOUT_MS,
} from '../constants.js';
import type {
  DaemonHandle,
  DaemonSpec,
  DaemonSupervisorPort,
} from '../ports/daemon-supervisor.port.js';
import { down, up, type EngineHealth, type EngineId } from '../types.js';
import { BackoffTracker } from './backoff.js';
import { probeHttpHealth, waitForHealthy } from './health-prober.js';
import { ProcessRegistry } from './process-registry.js';

export interface DaemonSupervisorOptions {
  /** Skip auto-spawn under the test runner unless a spec opts in. */
  readonly allowSpawnInTest?: boolean;
}

export class DaemonSupervisor implements DaemonSupervisorPort {
  private readonly handles = new Map<string, DaemonHandle>();
  private readonly starting = new Map<string, Promise<DaemonHandle | null>>();
  private readonly backoff = new Map<string, BackoffTracker>();

  constructor(
    private readonly registry: ProcessRegistry,
    private readonly log: Logger,
    private readonly options: DaemonSupervisorOptions = {},
  ) {}

  async ensureStarted(spec: DaemonSpec): Promise<DaemonHandle | null> {
    const existing = this.handles.get(spec.engineId);
    if (existing) return existing;
    const inflight = this.starting.get(spec.engineId);
    if (inflight) return inflight;

    const promise = this.start(spec).finally(() => this.starting.delete(spec.engineId));
    this.starting.set(spec.engineId, promise);
    return promise;
  }

  handle(engineId: string): DaemonHandle | null {
    return this.handles.get(engineId) ?? null;
  }

  async stop(engineId: string): Promise<void> {
    this.handles.delete(engineId);
    this.starting.delete(engineId);
    await this.registry.stop(engineId);
  }

  async stopAll(): Promise<void> {
    this.handles.clear();
    this.starting.clear();
    await this.registry.shutdownAll();
  }

  async health(spec: DaemonSpec): Promise<EngineHealth> {
    const engineId = spec.engineId as EngineId;
    // Externally-managed instance: probe the operator URL directly.
    const externalUrl = spec.externalUrl?.trim();
    if (externalUrl) {
      const probe = await probeHttpHealth(externalUrl, PROBE_TIMEOUT_MS, spec.healthPath ?? '/health');
      return this.probeToHealth(engineId, probe, externalUrl);
    }
    const handle = this.handles.get(spec.engineId);
    if (!handle) {
      if (!spec.binPath) {
        return down(engineId, 'daemon', 'binary not built / not resolved — daemon unavailable');
      }
      return down(engineId, 'daemon', 'daemon not started');
    }
    const probe = await probeHttpHealth(handle.baseUrl, PROBE_TIMEOUT_MS, spec.healthPath ?? '/health');
    return this.probeToHealth(engineId, probe, handle.baseUrl);
  }

  // --- internals ---

  private async start(spec: DaemonSpec): Promise<DaemonHandle | null> {
    // 1. Externally-managed: trust + probe, do NOT spawn a second instance.
    const externalUrl = spec.externalUrl?.trim();
    if (externalUrl) {
      const baseUrl = externalUrl.replace(/\/+$/, '');
      const probe = await probeHttpHealth(baseUrl, PROBE_TIMEOUT_MS, spec.healthPath ?? '/health');
      if (probe.status === 'down') {
        this.log.warn(
          { engineId: spec.engineId, baseUrl, reason: probe.reason },
          'externally-managed daemon URL set but not reachable — degrading',
        );
        return null;
      }
      const handle: DaemonHandle = { engineId: spec.engineId, mode: 'external', baseUrl };
      this.handles.set(spec.engineId, handle);
      this.log.info({ engineId: spec.engineId, baseUrl }, 'daemon externally managed — connecting, not spawning');
      return handle;
    }

    // 2. No binary → degrade (never throw).
    if (!spec.binPath) {
      this.log.info(
        { engineId: spec.engineId },
        'daemon binary not built / not resolved — staying on degrade path',
      );
      return null;
    }

    // 3. Under the test runner, do not auto-spawn a background child.
    if (process.env.NODE_ENV === 'test' && !this.options.allowSpawnInTest) {
      return null;
    }

    return this.spawnAndAdopt(spec);
  }

  private async spawnAndAdopt(spec: DaemonSpec): Promise<DaemonHandle | null> {
    const listenAddr = spec.listenAddr;
    if (!isLoopback(listenAddr)) {
      this.log.warn(
        { engineId: spec.engineId, listenAddr },
        'refusing to spawn daemon on a non-loopback bind — degrade-safe (loopback-only law)',
      );
      return null;
    }
    const baseUrl = `http://${listenAddr}`;
    const cwd = spec.cwd ?? (spec.binPath ? dirname(spec.binPath) : undefined);

    let child: ChildProcess;
    try {
      child = spawn(spec.binPath as string, [...spec.args], {
        // MINIMAL env: only the configured keys + listen addr. NEVER `...process.env`.
        env: { ...(spec.env ?? {}) },
        ...(cwd ? { cwd } : {}),
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.log.warn(
        { err: message(err), engineId: spec.engineId, binPath: spec.binPath },
        'daemon spawn failed — degrading',
      );
      return null;
    }

    this.registry.registerChild(spec.engineId, child);
    child.once('error', (err) => {
      this.log.warn({ err: message(err), engineId: spec.engineId }, 'daemon spawn error');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) this.log.debug({ engineId: spec.engineId, daemon: line }, 'daemon stderr');
    });
    child.once('exit', (code, signal) => this.onExit(spec, code, signal));
    if (typeof child.unref === 'function') child.unref();

    const probe = await waitForHealthy(
      baseUrl,
      spec.waitMs ?? DAEMON_WAIT_MS,
      HEALTH_POLL_MS,
      PROBE_TIMEOUT_MS,
      spec.healthPath ?? '/health',
    );
    if (probe.status === 'down' || child.exitCode !== null) {
      this.log.warn(
        { engineId: spec.engineId, listenAddr, exitCode: child.exitCode, reason: probe.reason },
        'daemon did not pass health check in time — degrading (port free? binary healthy?)',
      );
      await this.registry.stop(spec.engineId);
      return null;
    }

    this.getBackoff(spec.engineId).reset();
    const handle: DaemonHandle = {
      engineId: spec.engineId,
      mode: 'spawned',
      baseUrl,
      ...(child.pid !== undefined ? { pid: child.pid } : {}),
    };
    this.handles.set(spec.engineId, handle);
    this.log.info({ engineId: spec.engineId, baseUrl, pid: child.pid }, 'daemon spawned + healthy');
    return handle;
  }

  private onExit(spec: DaemonSpec, code: number | null, signal: NodeJS.Signals | null): void {
    this.handles.delete(spec.engineId);
    if (this.registry.isSuppressed(spec.engineId)) {
      this.registry.forget(spec.engineId);
      return;
    }
    this.registry.forget(spec.engineId);
    if (process.env.NODE_ENV === 'test' && !this.options.allowSpawnInTest) return;

    const tracker = this.getBackoff(spec.engineId);
    if (tracker.exhausted()) {
      this.log.warn(
        { engineId: spec.engineId, attempts: tracker.attempts() },
        'daemon restart attempts exhausted — staying down (truthful)',
      );
      return;
    }
    const delay = tracker.next();
    this.log.warn(
      { engineId: spec.engineId, code, signal, delay, attempt: tracker.attempts() },
      'daemon exited — restarting after backoff',
    );
    setTimeout(() => {
      void this.spawnAndAdopt(spec);
    }, delay);
  }

  private probeToHealth(
    engineId: EngineId,
    probe: { status: 'up' | 'down' | 'degraded'; probeMs: number; reason?: string },
    baseUrl: string,
  ): EngineHealth {
    if (probe.status === 'up') {
      return up(engineId, 'daemon', { bindingPath: baseUrl, probeMs: probe.probeMs });
    }
    if (probe.status === 'degraded') {
      return {
        engineId,
        transport: 'daemon',
        status: 'degraded',
        reason: probe.reason ?? 'daemon reports degraded capability',
        bindingPath: baseUrl,
        probeMs: probe.probeMs,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      ...down(engineId, 'daemon', probe.reason ?? 'daemon health probe failed', { bindingPath: baseUrl }),
      probeMs: probe.probeMs,
    };
  }

  private getBackoff(engineId: string): BackoffTracker {
    let tracker = this.backoff.get(engineId);
    if (!tracker) {
      tracker = new BackoffTracker();
      this.backoff.set(engineId, tracker);
    }
    return tracker;
  }
}

/** True when a `host:port` listen addr binds a loopback interface only. */
export function isLoopback(listenAddr: string): boolean {
  let host = listenAddr.trim();
  const bracketed = host.match(/^\[(.+)\](?::\d+)?$/); // [ipv6]:port
  if (bracketed) {
    host = bracketed[1];
  } else if ((host.match(/:/g) ?? []).length === 1) {
    host = host.split(':')[0]; // ipv4/hostname:port (bare ipv6 like ::1 is left intact)
  }
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.startsWith('127.');
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
