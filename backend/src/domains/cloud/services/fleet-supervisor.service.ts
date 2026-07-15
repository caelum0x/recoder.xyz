/**
 * `FleetSupervisorService` — the cloud capacity manifest: nodes (sandbox pools /
 * preview runners / mesh endpoints) register + heartbeat, and the supervisor
 * marks stale nodes `down` (a node whose `last_seen` is older than the staleness
 * window is not trusted as `up`). Read paths list the manifest; a periodic sweep
 * demotes stale nodes.
 *
 * Truthful posture: `up` is derived from a FRESH heartbeat, never assumed — a
 * node the supervisor cannot confirm recently seen is reported `down`. Absent
 * repo ⇒ empty manifest + degraded health (never a fabricated node).
 */
import type { Logger } from '../../../shared/logger.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import { degraded, healthy, unhealthy } from '../../../shared/health-types.js';
import type { FleetRepository, FleetNodeUpsert } from '../ports/cloud-repository.port.js';
import type { FleetCapacity, FleetNode, FleetNodeKind } from '../types.js';

const SERVICE_NAME = 'cloud.fleet';

export interface FleetSupervisorDeps {
  readonly repo: FleetRepository;
  readonly logger: Logger;
  readonly now?: () => Date;
  /** A node is stale (→ `down`) when unseen for longer than this (ms). Default 90s. */
  readonly staleMs?: number;
  /** Sweep interval (ms). `0` disables the loop (default 30_000). */
  readonly sweepIntervalMs?: number;
}

export interface FleetSupervisorService {
  register(input: Omit<FleetNodeUpsert, 'lastSeen'>): Promise<FleetNode | null>;
  heartbeat(id: string, kind: FleetNodeKind, capacity: FleetCapacity, tenantId?: string | null): Promise<FleetNode | null>;
  list(): Promise<readonly FleetNode[]>;
  listByKind(kind: FleetNodeKind): Promise<readonly FleetNode[]>;
  /** Demote nodes whose heartbeat is stale; returns how many were demoted. */
  sweepStale(): Promise<number>;
  startSupervisor(): void;
  stop(): void;
  health(): Promise<ComponentHealth>;
}

export function createFleetSupervisorService(deps: FleetSupervisorDeps): FleetSupervisorService {
  const { repo, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const staleMs = deps.staleMs ?? 90_000;
  const sweepIntervalMs = deps.sweepIntervalMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | null = null;

  function isStale(node: FleetNode): boolean {
    const seen = Date.parse(node.lastSeen);
    if (!Number.isFinite(seen)) return true;
    return now().getTime() - seen > staleMs;
  }

  async function register(input: Omit<FleetNodeUpsert, 'lastSeen'>): Promise<FleetNode | null> {
    if (!repo.isAvailable()) return null;
    try {
      return await repo.upsert({ ...input, lastSeen: now().toISOString() });
    } catch (cause) {
      logger.warn({ err: cause, id: input.id }, 'fleet register failed');
      return null;
    }
  }

  async function heartbeat(
    id: string,
    kind: FleetNodeKind,
    capacity: FleetCapacity,
    tenantId?: string | null,
  ): Promise<FleetNode | null> {
    if (!repo.isAvailable()) return null;
    try {
      return await repo.upsert({
        id,
        tenantId: tenantId ?? null,
        kind,
        status: 'up',
        capacity,
        lastSeen: now().toISOString(),
      });
    } catch (cause) {
      logger.warn({ err: cause, id }, 'fleet heartbeat failed');
      return null;
    }
  }

  async function list(): Promise<readonly FleetNode[]> {
    if (!repo.isAvailable()) return [];
    try {
      return await repo.list();
    } catch {
      return [];
    }
  }

  async function listByKind(kind: FleetNodeKind): Promise<readonly FleetNode[]> {
    if (!repo.isAvailable()) return [];
    try {
      return await repo.listByKind(kind);
    } catch {
      return [];
    }
  }

  async function sweepStale(): Promise<number> {
    if (!repo.isAvailable()) return 0;
    let nodes: readonly FleetNode[];
    try {
      nodes = await repo.list();
    } catch {
      return 0;
    }
    let demoted = 0;
    for (const node of nodes) {
      if (node.status !== 'down' && isStale(node)) {
        try {
          await repo.upsert({
            id: node.id,
            tenantId: node.tenantId,
            kind: node.kind,
            status: 'down',
            capacity: node.capacity,
            manifest: node.manifest,
            lastSeen: node.lastSeen, // preserve the last real sighting
          });
          demoted += 1;
        } catch (cause) {
          logger.warn({ err: cause, id: node.id }, 'fleet demote failed');
        }
      }
    }
    if (demoted > 0) logger.info({ demoted }, 'fleet supervisor demoted stale nodes');
    return demoted;
  }

  function startSupervisor(): void {
    if (timer || sweepIntervalMs <= 0) return;
    timer = setInterval(() => {
      void sweepStale();
    }, sweepIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function health(): Promise<ComponentHealth> {
    if (!repo.isAvailable()) {
      return unhealthy(SERVICE_NAME, 'Fleet store unavailable — capacity manifest unreadable.');
    }
    const nodes = await list();
    const up = nodes.filter((n) => n.status === 'up' && !isStale(n)).length;
    const detail = { nodes: nodes.length, up, down: nodes.length - up };
    // The fleet is registered-but-optional infrastructure: no nodes ⇒ degraded,
    // not down (the module still serves sandboxes via provider adapters directly).
    if (nodes.length === 0) return degraded(SERVICE_NAME, 'No fleet nodes registered.', undefined);
    return healthy(SERVICE_NAME, detail);
  }

  return { register, heartbeat, list, listByKind, sweepStale, startSupervisor, stop, health };
}
