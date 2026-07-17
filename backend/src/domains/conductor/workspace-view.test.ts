/**
 * WorkspaceView — the attention-enriched read model (`GET /workspaces/:id/view`,
 * `GET /views`) the composer builds over the classifier.
 *
 * Proves: every view carries a truthful attention + reason; a running workspace
 * with NO live tail signal reports `'unknown'` (never a guess); a failed launch
 * reports `'error'`; a review-flow workspace reports `'review_ready'`; a missing
 * workspace is null; the list view covers every record.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';

describe('conductor workspace views', () => {
  it('running workspace with no recognizable signal → truthful unknown + probed liveness', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(created.value?.state).toBe('running');

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view).not.toBeNull();
    expect(view?.state).toBe('running');
    expect(view?.attention).toBe('unknown');
    expect(view?.attentionReason).toBeTruthy();
    // The substrate WAS probed (running state) — liveness is reported, not guessed.
    expect(typeof view?.live).toBe('boolean');
  });

  it('failed launch (no substrate wired) → attention error from the durable state', async () => {
    const { module } = composeConductor({ substrates: [] });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(created.value?.state).toBe('failed');

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view?.attention).toBe('error');
    expect(view?.attentionReason).toContain('failed');
  });

  it('awaiting_review workspace → review_ready', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    await module.advanceWorkspaceState(created.value!.workspaceId, 'awaiting_review', makePrincipal());

    const view = await module.workspaceView(created.value!.workspaceId);

    expect(view?.state).toBe('awaiting_review');
    expect(view?.attention).toBe('review_ready');
  });

  it('returns null for an unknown workspace', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    expect(await module.workspaceView('ws_missing')).toBeNull();
  });

  it('listWorkspaceViews covers every record with a populated attention', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await module.createWorkspace(makeCreateInput({ taskId: 'task_a' }), makePrincipal());
    await module.createWorkspace(makeCreateInput({ taskId: 'task_b' }), makePrincipal());

    const views = await module.listWorkspaceViews();

    expect(views).toHaveLength(2);
    for (const view of views) {
      expect(view.attention).toBeDefined();
      expect(view.attentionReason).toBeTruthy();
    }
  });
});
