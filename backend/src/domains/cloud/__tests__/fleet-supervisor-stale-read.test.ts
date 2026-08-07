/**
 * fleet-supervisor read paths must derive `down` for a STALE node (recoder-3rl4).
 *
 * heartbeat stores status 'up'; sweepStale demotes stale nodes to 'down' only when
 * the periodic sweep runs. Between sweeps, list()/listByKind() returned the stored
 * 'up' for a node whose last_seen is older than the staleness window — a dead node
 * reported healthy. The read paths must apply the same isStale derivation the sweep
 * uses so the fleet view is truthful regardless of sweep timing.
 */
import { describe, it, expect } from 'vitest';
import { createFleetSupervisorService } from '../services/fleet-supervisor.service.js';
import type { FleetNode } from '../types.js';

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; },
} as unknown as Parameters<typeof createFleetSupervisorService>[0]['logger'];

function node(id: string, lastSeen: string, status: 'up' | 'down' = 'up'): FleetNode {
  return {
    id, tenantId: null, kind: 'sandbox', status,
    capacity: { slotsTotal: 10, slotsUsed: 1, cpuMillis: 4000, memMb: 8192 },
    manifest: {}, lastSeen, createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as FleetNode;
}

const NOW = new Date('2026-01-01T00:10:00.000Z'); // staleMs default = 90_000ms

function svc(nodes: FleetNode[]) {
  const repo = {
    isAvailable: () => true,
    list: async () => nodes,
    listByKind: async () => nodes,
    upsert: async (n: unknown) => n,
  } as unknown as Parameters<typeof createFleetSupervisorService>[0]['repo'];
  return createFleetSupervisorService({ repo, logger: silentLogger, now: () => NOW });
}

describe('fleet supervisor — read paths derive down for stale nodes', () => {
  it('list() reports a stale (dead) node as down, not the stored up', async () => {
    const fleet = svc([
      node('stale', '2026-01-01T00:00:00.000Z'), // 10 min old > 90s ⇒ stale
      node('fresh', '2026-01-01T00:09:30.000Z'), // 30s old < 90s ⇒ fresh
    ]);
    const listed = await fleet.list();
    expect(listed.find((n) => n.id === 'stale')!.status).toBe('down');
    expect(listed.find((n) => n.id === 'fresh')!.status).toBe('up');
  });

  it('listByKind() applies the same derivation', async () => {
    const fleet = svc([node('stale', '2026-01-01T00:00:00.000Z')]);
    const listed = await fleet.listByKind('sandbox');
    expect(listed[0]!.status).toBe('down');
  });
});
