/**
 * Test fixture: a fully-degraded `IssueGraphService` fake (every read empty,
 * every write refused — the null-transport posture), overridable per test. The
 * memory suites compose their live/throwing beads fakes over this base instead
 * of re-typing the whole facet.
 */
import type { IssueGraphService } from '../ports/issue-graph.port.js';

/** Build an issue-graph fake: degraded base + per-test overrides. */
export function fakeIssueGraph(overrides: Partial<IssueGraphService> = {}): IssueGraphService {
  return {
    health: async () => ({ available: false, reason: 'fixture: bd not wired' }),
    ready: async () => [],
    show: async () => null,
    search: async () => [],
    blocked: async () => [],
    depTree: async () => null,
    depList: async () => null,
    stats: async () => null,
    stale: async () => [],
    create: async () => null,
    update: async () => false,
    claim: async () => false,
    close: async () => false,
    note: async () => false,
    remember: async () => undefined,
    recallMemories: async () => [],
    promote: async () => false,
    vcStatus: async () => null,
    flush: async () => ({ committed: false, reason: 'fixture: bd not wired' }),
    gc: async () => ({ ran: false, reason: 'fixture: bd not wired' }),
    ...overrides,
  };
}
