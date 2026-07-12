/**
 * FleetSupervisor — the declarative supervisor for the polyglot fleet
 * (RECODER-ENGINES.md §11). It reads the `FLEET` manifest and reports, per
 * service, a TRUTHFUL `{ id, available, source, reason }` by probing configured
 * endpoints. It generalizes `conductor/openfang-daemon.ts` from one hand-wired
 * daemon into data-driven supervision.
 *
 * HARD INVARIANTS (degrade-safe by construction):
 *   - NEVER builds a binary and (this phase) NEVER spawns a process. `ensure()`
 *     and `stop()` are safe no-ops that only report probe status.
 *   - With NO external service/daemon/key present, every service resolves to
 *     `available:false` + its `degradeTo` fallback name — it never throws, never
 *     fakes success.
 *   - All deps (fetch, fs existence, tcp/cmd probes) are INJECTABLE so this unit
 *     tests with fakes and touches no network/subprocess/filesystem.
 */
import { createLogger } from '../logger.js';
import {
  FLEET,
  getFleetService,
  type FleetService,
  type FleetLang,
} from './manifest.js';

const logger = createLogger('fleet:supervisor');

/** Default probe timeout for HTTP health checks (ms). */
const HTTP_PROBE_TIMEOUT_MS = Number(process.env.RECODER_FLEET_PROBE_TIMEOUT_MS) || 3_000;

/** Result of a low-level HTTP probe (never throws — errors become `ok:false`). */
export interface FleetHttpProbeResult {
  readonly ok: boolean;
  readonly status: number;
  readonly message: string;
}

/**
 * Where availability was determined:
 *  - `endpoint` — a configured/loopback endpoint responded (or its socket exists).
 *  - `binary`   — a prebuilt binary/CLI resolved (used for CLI-only services).
 *  - `none`     — nothing configured or present (⇒ degraded to the TS fallback).
 */
export type FleetStatusSource = 'endpoint' | 'binary' | 'none';

/** The truthful per-service status the supervisor reports. */
export interface FleetServiceStatus {
  readonly id: string;
  readonly lang: FleetLang;
  readonly available: boolean;
  readonly source: FleetStatusSource;
  readonly reason: string;
  /** The pure-TS fallback active when `available` is false. */
  readonly degradeTo: string;
  readonly loopbackOnly: boolean;
}

/** Aggregate fleet health for the `/health/full` surface. */
export interface FleetHealth {
  readonly services: readonly FleetServiceStatus[];
  readonly summary: {
    readonly total: number;
    readonly available: number;
    readonly degraded: number;
  };
  readonly generatedAt: string;
}

/** Minimal fetch shape the supervisor needs — matches global `fetch`. */
export type FleetFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number }>;

/**
 * Injectable seams. All optional; every default is degrade-safe. Tests pass fakes
 * so no network/subprocess/filesystem is touched.
 */
export interface FleetSupervisorDeps {
  /** Env source (defaults to `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /** Manifest override (defaults to the shipped `FLEET`). */
  readonly services?: readonly FleetService[];
  /** HTTP fetch used for `http` health probes (defaults to global `fetch`). */
  readonly fetch?: FleetFetch;
  /** Existence check for `uds-ping` sockets (defaults to `fs.existsSync`). */
  readonly fileExists?: (path: string) => boolean;
  /**
   * Optional command runner for `cmd` health (e.g. `bd vc status`). When absent,
   * the supervisor does NOT spawn a subprocess and instead reports binary presence.
   */
  readonly cmdProbe?: (cmd: readonly string[]) => Promise<boolean>;
  /** Optional TCP reachability for `grpc` targets (defaults to no probe). */
  readonly tcpProbe?: (host: string, port: number) => Promise<boolean>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Default fs-existence check, lazily required so tests can stay fs-free. */
function defaultFileExists(path: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    return existsSync(path);
  } catch {
    return false;
  }
}

function available(
  svc: FleetService,
  source: FleetStatusSource,
  reason: string,
): FleetServiceStatus {
  return {
    id: svc.id,
    lang: svc.lang,
    available: true,
    source,
    reason,
    degradeTo: svc.degradeTo,
    loopbackOnly: svc.loopbackOnly,
  };
}

function degraded(
  svc: FleetService,
  source: FleetStatusSource,
  reason: string,
): FleetServiceStatus {
  return {
    id: svc.id,
    lang: svc.lang,
    available: false,
    source,
    reason: `${reason} — degraded to: ${svc.degradeTo}`,
    degradeTo: svc.degradeTo,
    loopbackOnly: svc.loopbackOnly,
  };
}

/** Parse `host:port` (or bare host) into components, falling back to a default port. */
function parseHostPort(target: string, defaultPort?: number): { host: string; port: number } {
  const trimmed = target.replace(/^\w+:\/\//, '');
  const idx = trimmed.lastIndexOf(':');
  if (idx > 0) {
    const host = trimmed.slice(0, idx);
    const port = Number(trimmed.slice(idx + 1));
    if (Number.isFinite(port) && port > 0) return { host, port };
  }
  return { host: trimmed || '127.0.0.1', port: defaultPort ?? 0 };
}

export class FleetSupervisor {
  private readonly env: NodeJS.ProcessEnv;
  private readonly services: readonly FleetService[];
  private readonly fetch?: FleetFetch;
  private readonly fileExists: (path: string) => boolean;
  private readonly cmdProbe?: (cmd: readonly string[]) => Promise<boolean>;
  private readonly tcpProbe?: (host: string, port: number) => Promise<boolean>;

  constructor(deps: FleetSupervisorDeps = {}) {
    this.env = deps.env ?? process.env;
    this.services = deps.services ?? FLEET;
    this.fetch = deps.fetch ?? (globalThis.fetch as FleetFetch | undefined);
    this.fileExists = deps.fileExists ?? defaultFileExists;
    this.cmdProbe = deps.cmdProbe;
    this.tcpProbe = deps.tcpProbe;
  }

  /** The manifest this supervisor is driving (read-only). */
  list(): readonly FleetService[] {
    return this.services;
  }

  /** Low-level HTTP probe: 2xx/3xx ⇒ ok. Never throws. */
  private async httpProbe(url: string): Promise<FleetHttpProbeResult> {
    if (!this.fetch) {
      return { ok: false, status: 0, message: 'fetch is unavailable in this runtime' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
    try {
      const res = await this.fetch(url, { signal: controller.signal });
      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: res.status,
        message: ok ? `reachable (HTTP ${res.status})` : `unhealthy (HTTP ${res.status})`,
      };
    } catch (err) {
      return { ok: false, status: 0, message: `unreachable: ${errMsg(err)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe a single service into a truthful status. Never throws. */
  async probe(svc: FleetService): Promise<FleetServiceStatus> {
    try {
      switch (svc.health.kind) {
        case 'http': {
          const url = svc.healthUrl(this.env);
          if (!url) return degraded(svc, 'none', `${svc.id}: endpoint not configured`);
          const result = await this.httpProbe(url);
          return result.ok
            ? available(svc, 'endpoint', `${svc.id}: ${result.message} at ${url}`)
            : degraded(svc, 'endpoint', `${svc.id}: ${result.message} at ${url}`);
        }
        case 'uds-ping': {
          const sock = svc.resolveEndpoint(this.env);
          if (!sock) return degraded(svc, 'none', `${svc.id}: socket path not configured`);
          return this.fileExists(sock)
            ? available(svc, 'endpoint', `${svc.id}: UDS socket present at ${sock}`)
            : degraded(svc, 'endpoint', `${svc.id}: UDS socket absent at ${sock}`);
        }
        case 'grpc': {
          const target = svc.resolveEndpoint(this.env);
          if (!target) return degraded(svc, 'none', `${svc.id}: gRPC target not configured`);
          if (!this.tcpProbe) {
            return degraded(
              svc,
              'endpoint',
              `${svc.id}: gRPC target ${target} present but not probed (no tcp prober)`,
            );
          }
          const { host, port } = parseHostPort(target, svc.port);
          const ok = await this.tcpProbe(host, port);
          return ok
            ? available(svc, 'endpoint', `${svc.id}: gRPC target reachable at ${target}`)
            : degraded(svc, 'endpoint', `${svc.id}: gRPC target unreachable at ${target}`);
        }
        case 'cmd': {
          const bin = svc.resolveBinary(this.env);
          if (!bin) return degraded(svc, 'none', `${svc.id}: CLI not found (no prebuilt binary)`);
          if (this.cmdProbe && svc.health.run) {
            const ok = await this.cmdProbe(svc.health.run);
            return ok
              ? available(svc, 'binary', `${svc.id}: CLI healthy (${svc.health.run.join(' ')})`)
              : degraded(svc, 'binary', `${svc.id}: health command failed`);
          }
          return available(svc, 'binary', `${svc.id}: CLI resolved at ${bin}`);
        }
        default:
          return degraded(svc, 'none', `${svc.id}: no health probe defined`);
      }
    } catch (err) {
      // A probe must never take the supervisor down.
      return degraded(svc, 'none', `${svc.id}: probe error: ${errMsg(err)}`);
    }
  }

  /** Probe every service (in parallel) and return truthful per-service status. */
  async status(): Promise<FleetServiceStatus[]> {
    return Promise.all(this.services.map((svc) => this.probe(svc)));
  }

  /**
   * Ensure a service is up. PHASE-1: a safe no-op — no service is spawned and no
   * binary is built. Returns the current probe status so callers get truthful
   * state instead of a fabricated "started". A no-spawn service always no-ops.
   */
  async ensure(id: string): Promise<FleetServiceStatus | undefined> {
    const svc = this.services.find((s) => s.id === id);
    if (!svc) {
      logger.warn({ id }, 'fleet ensure: unknown service id');
      return undefined;
    }
    if (!svc.spawnable) {
      logger.debug(
        { id, degradeTo: svc.degradeTo },
        'fleet ensure: service has no spawn recipe (no-op) — reporting probe status',
      );
    }
    return this.probe(svc);
  }

  /**
   * Stop a service. PHASE-1: a safe no-op — the supervisor owns no child processes
   * yet. Kept as a stable seam so callers can wire teardown without special-casing.
   */
  async stop(id: string): Promise<void> {
    const svc = this.services.find((s) => s.id === id);
    if (!svc) {
      logger.warn({ id }, 'fleet stop: unknown service id');
      return;
    }
    logger.debug({ id }, 'fleet stop: no-op (supervisor owns no spawned processes this phase)');
  }

  /** Aggregate health for `/health/full`. */
  async health(): Promise<FleetHealth> {
    const services = await this.status();
    const availableCount = services.filter((s) => s.available).length;
    return {
      services,
      summary: {
        total: services.length,
        available: availableCount,
        degraded: services.length - availableCount,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Convenience for the `/health/full` route: build a supervisor (optionally with
 * injected deps) and return the aggregate fleet health. Degrade-safe — with no
 * services present it reports every entry as degraded, never throwing.
 */
export async function getFleetHealth(deps: FleetSupervisorDeps = {}): Promise<FleetHealth> {
  return new FleetSupervisor(deps).health();
}

/** Re-export for callers that only need to look up a manifest entry. */
export { getFleetService };
