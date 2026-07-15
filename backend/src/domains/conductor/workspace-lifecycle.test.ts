/**
 * Workspace lifecycle — the create path through the composer + engine.
 *
 * Proves: a create with a live substrate persists the record and reaches
 * `running` (state of record); a create with NO substrate wired fails TRUTHFULLY
 * (never a fabricated success); the created record is queryable and carries the
 * creating principal.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';

describe('conductor workspace lifecycle', () => {
  it('creates + launches a workspace to running with a live substrate', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate({ id: 'tmux_worktree' })] });
    const principal = makePrincipal('user_alice');

    const result = await module.createWorkspace(makeCreateInput(), principal);

    expect(result.ok).toBe(true);
    expect(result.verdict.effect).toBe('allow');
    expect(result.value?.state).toBe('running');
    expect(result.value?.createdBy).toBe('user_alice');
    expect(result.value?.substrate).toBe('tmux_worktree');
  });

  it('persists the created record so it is queryable by id and in the list', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(created.ok).toBe(true);
    const id = created.value!.workspaceId;

    const fetched = await module.getWorkspace(id);
    const list = await module.listWorkspaces();

    expect(fetched?.workspaceId).toBe(id);
    expect(list.map((w) => w.workspaceId)).toContain(id);
  });

  it('finalizes to a truthful failed record (never fabricates a launch) when no substrate is wired', async () => {
    const { module } = composeConductor({ substrates: [] });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    // The write was gated + performed, but with no substrate registered the launch
    // cannot succeed: the record is finalized to `failed` with a truthful error,
    // never left `running` and never a fabricated success.
    expect(result.value?.state).toBe('failed');
    expect(result.value?.state).not.toBe('running');
    expect(result.value?.metadata?.error).toBeTruthy();
  });
});
