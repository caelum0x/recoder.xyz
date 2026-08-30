/** Heartbeat HTTP ownership seam — no foreign id reaches a stateful/read seam. */
import { describe, expect, it, vi } from 'vitest';
import type { AgentRegistryService } from '../registry/agent-registry.js';
import type {
  HeartbeatSloService,
  LivenessVerdict,
} from '../registry/heartbeat-slo.js';
import type { AgentRow } from '../types.js';
import { readOwnedLiveness, recordOwnedHeartbeat } from './agents.routes.js';

const OWNER = 'tenant-owner';
const ATTACKER = 'tenant-attacker';
const AGENT_ID = 'runtime:codex';
const row: AgentRow = {
  id: AGENT_ID,
  userId: OWNER,
  kind: 'runtime',
  runtimeId: 'codex',
  card: { id: AGENT_ID, name: 'Codex', capabilities: [] },
  status: 'unknown',
};
const verdict: LivenessVerdict = {
  agentId: AGENT_ID,
  status: 'up',
  ageMs: 1,
  reason: 'Recent heartbeat.',
};

function seams() {
  const get = vi.fn(async (id: string, userId: string) =>
    id === AGENT_ID && userId === OWNER ? row : null
  );
  const record = vi.fn(async () => undefined);
  const reconcile = vi.fn(async () => verdict);
  const liveness = vi.fn(async () => verdict);
  return {
    registry: { get } as unknown as AgentRegistryService,
    heartbeat: {
      record,
      reconcile,
      liveness,
    } as unknown as HeartbeatSloService,
    get,
    record,
    reconcile,
    liveness,
  };
}

describe('owner-scoped heartbeat routes', () => {
  it('refuses a foreign heartbeat before the stateful record/reconcile seams', async () => {
    const s = seams();
    await expect(
      recordOwnedHeartbeat(s.registry, s.heartbeat, AGENT_ID, ATTACKER, {
        ok: true,
      })
    ).resolves.toBeNull();
    expect(s.get).toHaveBeenCalledWith(AGENT_ID, ATTACKER);
    expect(s.record).not.toHaveBeenCalled();
    expect(s.reconcile).not.toHaveBeenCalled();
  });

  it('records and reconciles an owned heartbeat with the authenticated owner key', async () => {
    const s = seams();
    await expect(
      recordOwnedHeartbeat(s.registry, s.heartbeat, AGENT_ID, OWNER, {
        ok: true,
        latencyMs: 12,
      })
    ).resolves.toEqual(verdict);
    expect(s.record).toHaveBeenCalledWith({
      agentId: AGENT_ID,
      userId: OWNER,
      ok: true,
      latencyMs: 12,
    });
    expect(s.reconcile).toHaveBeenCalledWith(AGENT_ID, OWNER);
  });

  it('returns no foreign liveness and never calls the read seam', async () => {
    const s = seams();
    await expect(
      readOwnedLiveness(s.registry, s.heartbeat, AGENT_ID, ATTACKER)
    ).resolves.toBeNull();
    expect(s.liveness).not.toHaveBeenCalled();
  });

  it('reads owned liveness with the authenticated owner key', async () => {
    const s = seams();
    await expect(
      readOwnedLiveness(s.registry, s.heartbeat, AGENT_ID, OWNER)
    ).resolves.toEqual(verdict);
    expect(s.liveness).toHaveBeenCalledWith(AGENT_ID, OWNER);
  });
});
