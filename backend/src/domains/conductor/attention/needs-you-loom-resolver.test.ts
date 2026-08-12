/**
 * `createNeedsYouLoomResolver` — proves pane→workspace attribution is authoritative-record
 * driven + truthful: a mapped pane resolves kind/owner/taskGroup from the durable record;
 * an unmapped pane is `null` (dropped, never guessed); the index refreshes on a miss but is
 * rate-limited; and a workspace the record does not know is `null`.
 */
import { describe, it, expect } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import {
  createNeedsYouLoomResolver,
  type LoomPaneRow,
} from './needs-you-loom-resolver.js';

function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws1',
    runtimeId: 'claude',
    createdBy: 'user-1',
    metadata: { taskGroup: 'g1' },
    ...over,
  } as unknown as Workspace;
}

describe('createNeedsYouLoomResolver', () => {
  it('attributes a mapped pane from the durable workspace record', async () => {
    let clock = 0;
    const resolver = createNeedsYouLoomResolver({
      loadPanes: async () => [{ paneId: 'p1', workspaceId: 'ws1' }],
      getWorkspace: async () => workspace(),
      now: () => clock,
    });
    const out = await resolver.resolve('p1', 'blocked');
    expect(out).toEqual({
      workspaceId: 'ws1',
      agentKind: 'claude',
      owner: 'user-1',
      taskGroup: 'g1',
      nativeStatus: 'blocked',
    });
    void clock;
  });

  it('returns null for a pane no snapshot maps (never a guessed workspace)', async () => {
    const resolver = createNeedsYouLoomResolver({
      loadPanes: async () => [{ paneId: 'p1', workspaceId: 'ws1' }],
      getWorkspace: async () => workspace(),
      now: () => 0,
    });
    expect(await resolver.resolve('p_missing', 'blocked')).toBeNull();
  });

  it('returns null when the workspace record is unknown to Recoder', async () => {
    const resolver = createNeedsYouLoomResolver({
      loadPanes: async () => [{ paneId: 'p1', workspaceId: 'ws1' }],
      getWorkspace: async () => null,
      now: () => 0,
    });
    expect(await resolver.resolve('p1', 'done')).toBeNull();
  });

  it('refreshes the index on a miss, then serves the newly-seen pane', async () => {
    let clock = 0;
    let rows: LoomPaneRow[] = [];
    let loads = 0;
    const resolver = createNeedsYouLoomResolver({
      loadPanes: async () => {
        loads += 1;
        return rows;
      },
      getWorkspace: async () => workspace({ workspaceId: 'ws2' }),
      now: () => clock,
      refreshIntervalMs: 100,
    });

    // First resolve: miss + refresh (empty) ⇒ null.
    expect(await resolver.resolve('p2', 'idle')).toBeNull();
    expect(loads).toBe(1);

    // The pane appears; but the refresh interval has not elapsed ⇒ no re-load, still null.
    rows = [{ paneId: 'p2', workspaceId: 'ws2' }];
    expect(await resolver.resolve('p2', 'idle')).toBeNull();
    expect(loads).toBe(1);

    // After the interval elapses, a miss triggers a fresh load and now resolves.
    clock = 200;
    const out = await resolver.resolve('p2', 'idle');
    expect(loads).toBe(2);
    expect(out?.workspaceId).toBe('ws2');
  });

  it('keeps the last index when a snapshot refresh throws (stale, not fabricated)', async () => {
    let clock = 0;
    let fail = false;
    const resolver = createNeedsYouLoomResolver({
      loadPanes: async () => {
        if (fail) throw new Error('snapshot down');
        return [{ paneId: 'p1', workspaceId: 'ws1' }];
      },
      getWorkspace: async () => workspace(),
      now: () => clock,
      refreshIntervalMs: 10,
    });

    // Warm the index.
    expect((await resolver.resolve('p1', 'blocked'))?.workspaceId).toBe('ws1');
    // A later miss with a failing snapshot leaves the warm index intact.
    fail = true;
    clock = 100;
    expect(await resolver.resolve('p_missing', 'idle')).toBeNull();
    expect((await resolver.resolve('p1', 'working'))?.workspaceId).toBe('ws1');
  });
});
