/**
 * `MulticaCoordinationAdapter` over the Multica coordination HTTP surface. Tests
 * MOCK the `fetchImpl` + `baseUrlResolver` seams — no network, no live Go server.
 * They pin: truthful degrade when unconfigured / on a non-2xx / on a thrown fetch;
 * correct parsing of the routing view; the work-lock counts; the DERIVED conflict
 * detection (one issue held by 2+ working members); and the governed reroute POST.
 *
 * LIVE PATH: set `MULTICA_URL` (+ `MULTICA_API_KEY`, `MULTICA_WORKSPACE_ID`) — the
 * composer's default `baseUrlResolver` reads `MULTICA_URL`; the Go squads server
 * needs PG15. This suite deliberately never reaches it.
 */
import { describe, it, expect, vi } from 'vitest';
import { MulticaCoordinationAdapter, type FetchLike } from '../adapters/multica-coordination.adapter.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const BASE = 'http://127.0.0.1:38080';

/** Route a fake fetch by URL suffix. */
function router(routes: Record<string, () => Response>): FetchLike {
  return vi.fn(async (input: string) => {
    for (const [suffix, make] of Object.entries(routes)) {
      if (input.includes(suffix)) return make();
    }
    throw new Error(`unrouted: ${input}`);
  });
}

function adapter(fetchImpl: FetchLike, base: string | null = BASE): MulticaCoordinationAdapter {
  return new MulticaCoordinationAdapter({ baseUrlResolver: () => base, fetchImpl, logger: silentLogger });
}

describe('MulticaCoordinationAdapter — degrade-safe coordination introspection', () => {
  it('degrades truthfully (unconfigured) when no base URL resolves', async () => {
    const a = adapter(router({}), null);
    const routing = await a.routingStatus();
    expect(routing.available).toBe(false);
    expect(routing.mode).toBe('unconfigured');
    expect(routing.squads).toEqual([]);

    const coord = await a.coordinationStatus();
    expect(coord.available).toBe(false);
    expect(coord.locks).toEqual([]);

    const conflicts = await a.conflictStatus();
    expect(conflicts.available).toBe(false);

    const reroute = await a.requestReroute({ issueId: 'I-1' });
    expect(reroute.routed).toBe(false);
  });

  it('parses the squad routing view from GET /api/squads', async () => {
    const a = adapter(
      router({ '/api/squads': () => jsonResponse([{ id: 's1', name: 'Alpha', leader_id: 'agent-1', member_count: 3 }]) }),
    );
    const res = await a.routingStatus();
    expect(res.available).toBe(true);
    expect(res.squads).toEqual([{ squadId: 's1', name: 'Alpha', leaderId: 'agent-1', memberCount: 3 }]);
  });

  it('degrades (available:false) on a non-2xx squads read — never a faked list', async () => {
    const a = adapter(router({ '/api/squads': () => jsonResponse(null, 503) }));
    const res = await a.routingStatus();
    expect(res.available).toBe(false);
    expect(res.squads).toEqual([]);
  });

  it('degrades when the fetch throws', async () => {
    const a = adapter(
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const res = await a.routingStatus();
    expect(res.available).toBe(false);
  });

  it('surfaces per-member work-lock status + counts', async () => {
    const a = adapter(
      router({
        '/api/squads/s1/members/status': () =>
          jsonResponse({
            members: [
              { member_type: 'agent', member_id: 'agent-1', status: 'working', active_issues: [{ issue_id: 'I-1' }] },
              { member_type: 'agent', member_id: 'agent-2', status: 'idle', active_issues: [] },
            ],
          }),
        '/api/squads': () => jsonResponse([{ id: 's1', name: 'Alpha', leader_id: 'agent-1', member_count: 2 }]),
      }),
    );
    const res = await a.coordinationStatus();
    expect(res.available).toBe(true);
    expect(res.workingCount).toBe(1);
    expect(res.idleCount).toBe(1);
    expect(res.locks.find((l) => l.memberId === 'agent-1')?.activeIssueIds).toEqual(['I-1']);
  });

  it('derives a conflict when one issue is held by 2+ working members', async () => {
    const a = adapter(
      router({
        '/api/squads/s1/members/status': () =>
          jsonResponse({
            members: [
              { member_type: 'agent', member_id: 'agent-1', status: 'working', active_issues: [{ issue_id: 'I-9' }] },
              { member_type: 'agent', member_id: 'agent-2', status: 'working', active_issues: [{ issue_id: 'I-9' }] },
            ],
          }),
        '/api/squads': () => jsonResponse([{ id: 's1', name: 'Alpha', leader_id: 'agent-1', member_count: 2 }]),
      }),
    );
    const res = await a.conflictStatus();
    expect(res.available).toBe(true);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0]?.issueId).toBe('I-9');
    expect(res.conflicts[0]?.contenders.map((c) => c.memberId).sort()).toEqual(['agent-1', 'agent-2']);
  });

  it('does NOT flag a conflict for distinct issues', async () => {
    const a = adapter(
      router({
        '/api/squads/s1/members/status': () =>
          jsonResponse({
            members: [
              { member_type: 'agent', member_id: 'agent-1', status: 'working', active_issues: [{ issue_id: 'I-1' }] },
              { member_type: 'agent', member_id: 'agent-2', status: 'working', active_issues: [{ issue_id: 'I-2' }] },
            ],
          }),
        '/api/squads': () => jsonResponse([{ id: 's1', name: 'Alpha', leader_id: 'agent-1', member_count: 2 }]),
      }),
    );
    const res = await a.conflictStatus();
    expect(res.conflicts).toEqual([]);
  });

  it('routes the governed reroute POST on 2xx', async () => {
    const fetchImpl = router({ '/squad-evaluated': () => jsonResponse({ ok: true }) });
    const a = adapter(fetchImpl);
    const res = await a.requestReroute({ issueId: 'I-1', reason: 'contended' });
    expect(res.routed).toBe(true);
    expect(res.issueId).toBe('I-1');
  });

  it('reroute degrades on a non-2xx and requires issueId', async () => {
    const a = adapter(router({ '/squad-evaluated': () => jsonResponse(null, 500) }));
    expect((await a.requestReroute({ issueId: 'I-1' })).routed).toBe(false);
    expect((await a.requestReroute({ issueId: '' })).routed).toBe(false);
  });
});
