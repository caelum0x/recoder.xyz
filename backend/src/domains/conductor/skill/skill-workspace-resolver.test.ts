/**
 * `createOwnedWorkspaceResolver` — proves the SECURITY workspace-resolution seam:
 * the caller-supplied value is resolved AS A WORKSPACE ID against the conductor
 * store, admitted ONLY when the record is OWNED by the acting subject and carries a
 * real server-side checkout path, and refused on every other path (unknown / traversal
 * / absolute-outside / non-owned / no-checkout). The resolved path is the store's own
 * `worktreePath`, never the raw client string.
 */
import { describe, it, expect } from 'vitest';
import {
  createOwnedWorkspaceResolver,
  type OwnedWorkspaceLookup,
} from './skill-workspace-resolver.js';

/** A tiny fake workspace store keyed by id. */
function lookup(
  records: Record<string, { createdBy: string; worktreePath?: string }>,
): OwnedWorkspaceLookup & { readonly ids: string[] } {
  const ids: string[] = [];
  return {
    ids,
    async getWorkspace(id: string) {
      ids.push(id);
      return records[id] ?? null;
    },
  };
}

describe('createOwnedWorkspaceResolver', () => {
  it('resolves an OWNED workspace to its REAL server-side checkout path', async () => {
    const store = lookup({ 'ws-1': { createdBy: 'user-1', worktreePath: '/srv/worktrees/ws-1' } });
    const resolver = createOwnedWorkspaceResolver(store);

    const out = await resolver.resolve({ workspace: 'ws-1', actorId: 'user-1' });
    expect(out).toEqual({ ok: true, path: '/srv/worktrees/ws-1' });
    // The value was used as a lookup KEY, never as a path.
    expect(store.ids).toEqual(['ws-1']);
  });

  it('REFUSES an unknown workspace id (no oracle, never trust)', async () => {
    const resolver = createOwnedWorkspaceResolver(lookup({}));
    const out = await resolver.resolve({ workspace: 'nope', actorId: 'user-1' });
    expect(out).toEqual({ ok: false, reason: 'unknown workspace: nope' });
  });

  it('REFUSES a traversal / absolute-outside value (matches no record)', async () => {
    const store = lookup({ 'ws-1': { createdBy: 'user-1', worktreePath: '/srv/worktrees/ws-1' } });
    const resolver = createOwnedWorkspaceResolver(store);
    for (const workspace of ['../../../../etc/passwd', '/etc/passwd', 'ws-1/../../root']) {
      const out = await resolver.resolve({ workspace, actorId: 'user-1' });
      expect(out.ok).toBe(false);
    }
  });

  it('REFUSES a workspace OWNED BY ANOTHER subject (IDOR)', async () => {
    const store = lookup({ 'ws-1': { createdBy: 'owner-9', worktreePath: '/srv/worktrees/ws-1' } });
    const resolver = createOwnedWorkspaceResolver(store);
    const out = await resolver.resolve({ workspace: 'ws-1', actorId: 'user-1' });
    expect(out).toEqual({ ok: false, reason: 'workspace is not owned by the acting subject' });
  });

  it('REFUSES an owned workspace that has NO server-side checkout path', async () => {
    const store = lookup({ 'ws-1': { createdBy: 'user-1' } });
    const resolver = createOwnedWorkspaceResolver(store);
    const out = await resolver.resolve({ workspace: 'ws-1', actorId: 'user-1' });
    expect(out).toEqual({
      ok: false,
      reason: 'workspace has no server-side checkout path to execute in',
    });
  });

  it('REFUSES an empty workspace or an empty actor id', async () => {
    const store = lookup({ 'ws-1': { createdBy: 'user-1', worktreePath: '/srv/worktrees/ws-1' } });
    const resolver = createOwnedWorkspaceResolver(store);
    expect(await resolver.resolve({ workspace: '  ', actorId: 'user-1' })).toMatchObject({ ok: false });
    expect(await resolver.resolve({ workspace: 'ws-1', actorId: '' })).toMatchObject({ ok: false });
    // A missing/empty input never even reached the store.
    expect(store.ids).toEqual([]);
  });
});
