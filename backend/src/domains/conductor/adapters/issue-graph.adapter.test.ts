/**
 * conductor issue-graph tracker — the typed {@link IssueGraphWriter} seam.
 *
 * Proves `createIssueGraphTracker` maps the frozen `IssueGraphPort` verbs onto
 * the injected memory-module write slice with an attributable actor
 * (`conductor:<workspaceId>` on launch, `conductor` on completion), and that
 * the SEAM LAW holds: an absent slice, a refused write (`false`), a hung write
 * (15s bound), or a throw is always a logged skip — never a throw across the
 * boundary, never fabricated issue state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createIssueGraphTracker, type IssueGraphWriter } from './issue-graph.adapter.js';
import { makeLogger } from '../__fixtures__/harness.js';

interface WriterCall {
  readonly verb: 'note' | 'update' | 'close';
  readonly id: string;
  readonly actor: string;
  readonly text?: string;
  readonly patch?: { status?: string };
  readonly reason?: string;
}

/** A recording IssueGraphWriter fake (the bootstrap seam shape). */
function makeWriter(result = true): { writer: IssueGraphWriter; calls: WriterCall[] } {
  const calls: WriterCall[] = [];
  return {
    calls,
    writer: {
      async note(id, text, actor) {
        calls.push({ verb: 'note', id, text, actor });
        return result;
      },
      async update(id, patch, actor) {
        calls.push({ verb: 'update', id, patch, actor });
        return result;
      },
      async close(id, reason, actor) {
        calls.push({ verb: 'close', id, reason, actor });
        return result;
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createIssueGraphTracker — trackWork', () => {
  it('notes the claim evidence then marks in_progress, attributed to conductor:<workspaceId>', async () => {
    const { writer, calls } = makeWriter();
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    await tracker.trackWork('bd-1', 'ws_9');

    expect(calls.map((c) => c.verb)).toEqual(['note', 'update']);
    expect(calls[0]).toMatchObject({
      id: 'bd-1',
      text: expect.stringContaining('ws_9'),
      actor: 'conductor:ws_9',
    });
    expect(calls[1]).toMatchObject({
      id: 'bd-1',
      patch: { status: 'in_progress' },
      actor: 'conductor:ws_9',
    });
  });

  it('skips truthfully when taskId is absent or the seam is not wired', async () => {
    const { writer, calls } = makeWriter();
    const wired = createIssueGraphTracker({ beads: writer, logger: makeLogger() });
    await wired.trackWork('  ', 'ws_9');
    expect(calls).toHaveLength(0);

    const unwired = createIssueGraphTracker({ beads: null, logger: makeLogger() });
    await expect(unwired.trackWork('bd-1', 'ws_9')).resolves.toBeUndefined();
  });

  it('a refused write (false) is a logged skip and the second write still runs', async () => {
    const { writer, calls } = makeWriter(false);
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    await expect(tracker.trackWork('bd-1', 'ws_9')).resolves.toBeUndefined();
    // Both writes attempted independently — a refused note never blocks the update.
    expect(calls.map((c) => c.verb)).toEqual(['note', 'update']);
  });

  it('a throwing writer never escapes into the run flow (defensive)', async () => {
    const writer: IssueGraphWriter = {
      note: async () => {
        throw new Error('facet bug');
      },
      update: async () => {
        throw new Error('facet bug');
      },
      close: async () => true,
    };
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });
    await expect(tracker.trackWork('bd-1', 'ws_9')).resolves.toBeUndefined();
  });

  it('a hung write is bounded at 15s and skipped — launch never stalls', async () => {
    vi.useFakeTimers();
    const writer: IssueGraphWriter = {
      note: () => new Promise<boolean>(() => {}), // never settles
      update: () => new Promise<boolean>(() => {}),
      close: async () => true,
    };
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    let settled = false;
    const pending = tracker.trackWork('bd-1', 'ws_9').then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(15_001); // note deadline
    await vi.advanceTimersByTimeAsync(15_001); // update deadline
    await pending;
    expect(settled).toBe(true);
  });
});

describe('createIssueGraphTracker — completeWork', () => {
  it('notes the outcome then closes on completed, attributed to conductor', async () => {
    const { writer, calls } = makeWriter();
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    await tracker.completeWork('bd-1', 'completed');

    expect(calls.map((c) => c.verb)).toEqual(['note', 'close']);
    expect(calls[0]).toMatchObject({
      id: 'bd-1',
      text: 'Recoder workspace run completed',
      actor: 'conductor',
    });
    expect(calls[1]).toMatchObject({
      id: 'bd-1',
      reason: 'Completed via Recoder workspace run',
      actor: 'conductor',
    });
  });

  it('a failed run is noted but the issue stays open (no close)', async () => {
    const { writer, calls } = makeWriter();
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    await tracker.completeWork('bd-1', 'failed');

    expect(calls.map((c) => c.verb)).toEqual(['note']);
    expect(calls[0]).toMatchObject({ text: 'Recoder workspace run failed', actor: 'conductor' });
  });

  it('skips truthfully when taskId is absent or the seam is not wired', async () => {
    const { writer, calls } = makeWriter();
    const wired = createIssueGraphTracker({ beads: writer, logger: makeLogger() });
    await wired.completeWork('', 'completed');
    expect(calls).toHaveLength(0);

    const unwired = createIssueGraphTracker({ beads: undefined, logger: makeLogger() });
    await expect(unwired.completeWork('bd-1', 'completed')).resolves.toBeUndefined();
  });
});

/** A writer fake that answers the openLinkedWork backing verbs (depList / blocked). */
function makeLinkedWriter(opts: {
  depList?: (id: string, o?: { direction?: string }) => Promise<unknown>;
  blocked?: () => Promise<readonly { id: string; title: string; status: string }[]>;
}): IssueGraphWriter {
  const base: IssueGraphWriter = {
    async note() {
      return true;
    },
    async update() {
      return true;
    },
    async close() {
      return true;
    },
    async show() {
      return null;
    },
  };
  return {
    ...base,
    ...(opts.depList ? { depList: opts.depList } : {}),
    ...(opts.blocked ? { blocked: opts.blocked } : {}),
  };
}

describe('createIssueGraphTracker — openLinkedWork', () => {
  it('prefers dep-list dependents (direction up): maps non-closed to {id,title}, drops closed + the task itself', async () => {
    const calls: { id: string; direction?: string }[] = [];
    const writer = makeLinkedWriter({
      depList: async (id, o) => {
        calls.push({ id, direction: o?.direction });
        return [
          { id: 'bd-2', title: 'wire the thing', status: 'open', dependency_type: 'discovered-from' },
          { id: 'bd-3', title: 'done already', status: 'closed' },
          { id: 'bd-4', title: 'in flight', status: 'in_progress' },
          { id: 'bd-1', title: 'the task itself', status: 'open' },
        ];
      },
    });
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });

    const linked = await tracker.openLinkedWork!('bd-1');

    expect(calls).toEqual([{ id: 'bd-1', direction: 'up' }]);
    expect(linked).toEqual([
      { id: 'bd-2', title: 'wire the thing' },
      { id: 'bd-4', title: 'in flight' },
    ]);
  });

  it('dedupes by id and tolerates malformed records (never throws/fabricates)', async () => {
    const writer = makeLinkedWriter({
      depList: async () => [
        { id: 'bd-2', title: 'a', status: 'open' },
        { id: 'bd-2', title: 'dup', status: 'open' },
        null,
        { title: 'no id', status: 'open' },
        'garbage',
      ],
    });
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });
    await expect(tracker.openLinkedWork!('bd-1')).resolves.toEqual([{ id: 'bd-2', title: 'a' }]);
  });

  it('falls back to blocked({parent}) when depList is unwired', async () => {
    const writer = makeLinkedWriter({
      blocked: async () => [
        { id: 'bd-5', title: 'blocked child', status: 'open' },
        { id: 'bd-6', title: 'closed child', status: 'closed' },
      ],
    });
    const tracker = createIssueGraphTracker({ beads: writer, logger: makeLogger() });
    await expect(tracker.openLinkedWork!('bd-1')).resolves.toEqual([{ id: 'bd-5', title: 'blocked child' }]);
  });

  it('returns [] when the task has no open linked work', async () => {
    const tracker = createIssueGraphTracker({ beads: makeLinkedWriter({ depList: async () => [] }), logger: makeLogger() });
    await expect(tracker.openLinkedWork!('bd-1')).resolves.toEqual([]);
  });

  it('returns null (not probed) when taskId is absent, the seam is unwired, or no verb is present', async () => {
    const withVerb = createIssueGraphTracker({ beads: makeLinkedWriter({ depList: async () => [] }), logger: makeLogger() });
    await expect(withVerb.openLinkedWork!('')).resolves.toBeNull();

    const unwired = createIssueGraphTracker({ beads: null, logger: makeLogger() });
    await expect(unwired.openLinkedWork!('bd-1')).resolves.toBeNull();

    // A writer WITHOUT depList or blocked ⇒ source unavailable (null).
    const noVerb = createIssueGraphTracker({ beads: makeWriter().writer, logger: makeLogger() });
    await expect(noVerb.openLinkedWork!('bd-1')).resolves.toBeNull();
  });
});
