/**
 * `SidecarSupervisor` — the ONE implementation that supervises Python uv-venv
 * sidecars (mem0, browser-use over loopback HTTP; pal-mcp-server over stdio-MCP).
 *
 * A pre-spawn `auth-preflight` runs BEFORE any process is started: the venv
 * python + entrypoint must exist and every `requiredKeys` env var must be
 * present. Missing venv / missing key → the supervisor degrades to `down` with a
 * truthful reason and NEVER spawns, NEVER installs deps, NEVER fakes `ready`.
 *
 *  - `loopback-http`: spawn `<python> <entrypoint>` on a loopback addr, wait for
 *    `/health`, adopt + restart with backoff (mirrors the daemon supervisor).
 *  - `stdio-mcp`: delegate the process lifecycle to interop's
 *    `ExternalMcpProcessManager` (the host registers the config); the supervisor
 *    only runs preflight + reports truthful availability.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../../../shared/logger.js';
import { DAEMON_WAIT_MS, HEALTH_POLL_MS, PROBE_TIMEOUT_MS } from '../constants.js';
import type {
  PreflightResult,
  SidecarHandle,
  SidecarSpec,
  SidecarSupervisorPort,
} from '../ports/sidecar-supervisor.port.js';
import { down, up, type EngineHealth, type EngineId } from '../types.js';
import { BackoffTracker } from './backoff.js';
import { isLoopback } from './daemon-supervisor.js';
import { probeHttpHealth, waitForHealthy } from './health-prober.js';
import { ProcessRegistry } from './process-registry.js';

/**
 * The subset of interop's `ExternalMcpProcessManager` the supervisor needs for
 * the stdio-MCP variant. Injected so the supervisor never imports the process
 * manager concretely (and tests pass a fake).
 */
export interface ExternalProcessLike {
  ensureStarted(serverId: string): Promise<{ state: string } | null>;
  health(serverId: string): { state: string; healthy: boolean; detail?: string };
}

export interface SidecarSupervisorOptions {
  /** The interop external-process manager for `stdio-mcp` sidecars (optional). */
  readonly externalProcess?: ExternalProcessLike;
  /** Skip auto-spawn under the test runner unless a spec opts in. */
  readonly allowSpawnInTest?: boolean;
}

export class SidecarSupervisor implements SidecarSupervisorPort {
  private readonly handles = new Map<string, SidecarHandle>();
  private readonly starting = new Map<string, Promise<SidecarHandle | null>>();
  private readonly backoff = new Map<string, BackoffTracker>();

  constructor(
    private readonly registry: ProcessRegistry,
    private readonly log: Logger,
    private readonly options: SidecarSupervisorOptions = {},
  ) {}

  async preflight(spec: SidecarSpec): Promise<PreflightResult> {
    const checkedKeys = spec.requiredKeys ?? [];
    if (!spec.pythonPath || !existsSync(spec.pythonPath)) {
      return { ok: false, reason: 'uv venv python interpreter absent — sidecar unavailable', checkedKeys };
    }
    if (!spec.entrypoint || !existsSync(spec.entrypoint)) {
      return { ok: false, reason: 'sidecar entrypoint script absent', checkedKeys };
    }
    const missing = checkedKeys.filter((key) => !(spec.env && spec.env[key]?.trim()));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `required key(s) not configured: ${missing.join(', ')} — sidecar fails safe (down)`,
        checkedKeys,
      };
    }
    return { ok: true, checkedKeys };
  }

  async ensureStarted(spec: SidecarSpec): Promise<SidecarHandle | null> {
    const existing = this.handles.get(spec.engineId);
    if (existing) return existing;
    const inflight = this.starting.get(spec.engineId);
    if (inflight) return inflight;

    const promise = this.start(spec).finally(() => this.starting.delete(spec.engineId));
    this.starting.set(spec.engineId, promise);
    return promise;
  }

  handle(engineId: string): SidecarHandle | null {
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

  async health(spec: SidecarSpec): Promise<EngineHealth> {
    const engineId = spec.engineId as EngineId;
    const pre = await this.preflight(spec);
    if (!pre.ok) return down(engineId, 'sidecar', pre.reason ?? 'sidecar preflight failed');

    if (spec.transport === 'stdio-mcp') {
      const external = this.options.externalProcess;
      if (!external) return down(engineId, 'sidecar', 'stdio-mcp process manager not wired');
      const snapshot = external.health(spec.engineId);
      return snapshot.healthy
        ? up(engineId, 'sidecar', { bindingPath: spec.entrypoint ?? undefined })
        : down(engineId, 'sidecar', snapshot.detail ?? `sidecar state: ${snapshot.state}`);
    }

    const handle = this.handles.get(spec.engineId);
    if (!handle?.baseUrl) return down(engineId, 'sidecar', 'sidecar not started');
    const probe = await probeHttpHealth(handle.baseUrl, PROBE_TIMEOUT_MS);
    if (probe.status === 'up') {
      return up(engineId, 'sidecar', { bindingPath: handle.baseUrl, probeMs: probe.probeMs });
    }
    if (probe.status === 'degraded') {
      return {
        engineId,
        transport: 'sidecar',
        status: 'degraded',
        reason: probe.reason ?? 'sidecar reports degraded capability',
        bindingPath: handle.baseUrl,
        probeMs: probe.probeMs,
        checkedAt: new Date().toISOString(),
      };
    }
    return { ...down(engineId, 'sidecar', probe.reason ?? 'sidecar health probe failed', { bindingPath: handle.baseUrl }), probeMs: probe.probeMs };
  }

  // --- internals ---

  private async start(spec: SidecarSpec): Promise<SidecarHandle | null> {
    const pre = await this.preflight(spec);
    if (!pre.ok) {
      this.log.info({ engineId: spec.engineId, reason: pre.reason }, 'sidecar preflight failed — degrading (down)');
      return null;
    }

    if (spec.transport === 'stdio-mcp') {
      const external = this.options.externalProcess;
      if (!external) {
        this.log.info({ engineId: spec.engineId }, 'stdio-mcp sidecar has no process manager wired — degrading');
        return null;
      }
      const transport = await external.ensureStarted(spec.engineId);
      if (!transport || transport.state !== 'ready') {
        this.log.warn({ engineId: spec.engineId, state: transport?.state }, 'stdio-mcp sidecar not ready — degrading');
        return null;
      }
      const handle: SidecarHandle = {
        engineId: spec.engineId,
        transport: 'stdio-mcp',
        externalServerId: spec.engineId,
      };
      this.handles.set(spec.engineId, handle);
      return handle;
    }

    if (process.env.NODE_ENV === 'test' && !this.options.allowSpawnInTest) return null;
    return this.spawnHttp(spec);
  }

  private async spawnHttp(spec: SidecarSpec): Promise<SidecarHandle | null> {
    const listenAddr = spec.listenAddr;
    if (!listenAddr || !isLoopback(listenAddr)) {
      this.log.warn(
        { engineId: spec.engineId, listenAddr },
        'refusing to spawn sidecar on a non-loopback bind — degrade-safe (loopback-only law)',
      );
      return null;
    }
    const baseUrl = `http://${listenAddr}`;
    const cwd = spec.cwd ?? (spec.entrypoint ? dirname(spec.entrypoint) : undefined);

    let child: ChildProcess;
    try {
      child = spawn(spec.pythonPath as string, [spec.entrypoint as string, ...(spec.args ?? [])], {
        // MINIMAL env: required keys + listen addr only. NEVER `...process.env`.
        env: { ...(spec.env ?? {}) },
        ...(cwd ? { cwd } : {}),
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: false,
      });
    } catch (err) {
      this.log.warn({ err: message(err), engineId: spec.engineId }, 'sidecar spawn failed — degrading');
      return null;
    }

    this.registry.registerChild(spec.engineId, child);
    child.once('error', (err) => this.log.warn({ err: message(err), engineId: spec.engineId }, 'sidecar spawn error'));
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').trim();
      if (line) this.log.debug({ engineId: spec.engineId, sidecar: line }, 'sidecar stderr');
    });
    child.once('exit', (code, signal) => this.onExit(spec, code, signal));
    if (typeof child.unref === 'function') child.unref();

    const probe = await waitForHealthy(baseUrl, spec.waitMs ?? DAEMON_WAIT_MS, HEALTH_POLL_MS, PROBE_TIMEOUT_MS);
    if (probe.status === 'down' || child.exitCode !== null) {
      this.log.warn(
        { engineId: spec.engineId, listenAddr, exitCode: child.exitCode, reason: probe.reason },
        'sidecar did not pass health check — degrading',
      );
      await this.registry.stop(spec.engineId);
      return null;
    }

    this.getBackoff(spec.engineId).reset();
    const handle: SidecarHandle = {
      engineId: spec.engineId,
      transport: 'loopback-http',
      baseUrl,
      ...(child.pid !== undefined ? { pid: child.pid } : {}),
    };
    this.handles.set(spec.engineId, handle);
    this.log.info({ engineId: spec.engineId, baseUrl, pid: child.pid }, 'sidecar spawned + healthy');
    return handle;
  }

  private onExit(spec: SidecarSpec, code: number | null, signal: NodeJS.Signals | null): void {
    this.handles.delete(spec.engineId);
    if (this.registry.isSuppressed(spec.engineId)) {
      this.registry.forget(spec.engineId);
      return;
    }
    this.registry.forget(spec.engineId);
    if (process.env.NODE_ENV === 'test' && !this.options.allowSpawnInTest) return;

    const tracker = this.getBackoff(spec.engineId);
    if (tracker.exhausted()) return;
    const delay = tracker.next();
    this.log.warn({ engineId: spec.engineId, code, signal, delay }, 'sidecar exited — restarting after backoff');
    setTimeout(() => {
      void this.spawnHttp(spec);
    }, delay);
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

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
