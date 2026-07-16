/**
 * Workspace detail (the run screen) — module-level tests over the in-memory
 * harness. Proves the F2 surface end to end at the composer:
 *
 *  - events: the run's RunEvent log lists after create (tail-attached marker);
 *  - diff: the substrate diff is returned AND a running workspace moves to
 *    awaiting_review (review-on-first-look);
 *  - preview-url: loopback URLs persist to metadata.previewUrl (gated write),
 *    non-loopback is refused with nothing written (SSRF fence);
 *  - message (chat): a new run starts in the SAME worktree, the user's message
 *    is persisted as a `user_message` event, and the workspace returns to
 *    running; a running workspace refuses a second concurrent run truthfully;
 *  - archive: teardown + cancelled→archived transitions, worktree cleared;
 *  - gate deny: every one of these writes is refused when governance denies.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  makeCreateInput,
  makeGate,
  makePrincipal,
  FakeSubstrate,
} from './__fixtures__/harness.js';

const principal = makePrincipal();

async function createRunningWorkspace(module: ReturnType<typeof composeConductor>['module']) {
  const created = await module.createWorkspace(makeCreateInput() as never, principal);
  expect(created.ok).toBe(true);
  const workspace = created.value!;
  expect(workspace.state).toBe('running');
  return workspace;
}

describe('workspace detail — reads', () => {
  it('lists the run events for a created workspace', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    const events = await module.listWorkspaceEvents(workspace.workspaceId);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.runId === `run_${workspace.workspaceId}`)).toBe(true);
  });

  it('returns the substrate diff and advances running → awaiting_review', async () => {
    const substrate = new FakeSubstrate({
      diff: { stat: '1 file changed', patch: 'diff --git a/x b/x', untracked: ['new.txt'], changedFiles: 1 },
    });
    const { module } = composeConductor({ substrates: [substrate] });
    const workspace = await createRunningWorkspace(module);

    const diff = await module.workspaceDiff(workspace.workspaceId);
    expect(diff.patch).toContain('diff --git');
    expect(diff.untracked).toEqual(['new.txt']);
    expect(diff.changedFiles).toBe(1);

    const after = await module.getWorkspace(workspace.workspaceId);
    expect(after?.state).toBe('awaiting_review');
  });

  it('diff of an unknown workspace throws not found', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    await expect(module.workspaceDiff('ws_missing')).rejects.toThrow(/not found/);
  });
});

describe('workspace detail — preview url (gated)', () => {
  it('persists a loopback URL to metadata.previewUrl', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    const result = await module.setPreviewUrl(workspace.workspaceId, 'http://127.0.0.1:5173/', principal);
    expect(result.ok).toBe(true);
    expect(result.value?.metadata?.previewUrl).toBe('http://localhost:5173/');
  });

  it('refuses a non-loopback URL with nothing written', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    const result = await module.setPreviewUrl(workspace.workspaceId, 'http://evil.example.com/', principal);
    expect(result.ok).toBe(false);
    const after = await module.getWorkspace(workspace.workspaceId);
    expect(after?.metadata?.previewUrl).toBeUndefined();
  });
});

describe('workspace detail — message (chat)', () => {
  it('starts a new run in the same worktree and persists the user message', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    // Reviewing the diff parks the workspace in awaiting_review (continuable).
    await module.workspaceDiff(workspace.workspaceId);

    const result = await module.sendWorkspaceMessage(
      workspace.workspaceId,
      { text: 'also add tests please' },
      principal,
    );
    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
    expect(result.value?.runId).toBe(`run_${workspace.workspaceId}`);

    const events = await module.listWorkspaceEvents(workspace.workspaceId);
    const userMessage = events.find((e) => e.type === 'user_message');
    expect(userMessage?.message).toBe('also add tests please');

    const after = await module.getWorkspace(workspace.workspaceId);
    expect(after?.state).toBe('running');
    expect(after?.worktreePath).toBe(workspace.worktreePath);
  });

  it('refuses a message while the agent is still running', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    const result = await module.sendWorkspaceMessage(workspace.workspaceId, { text: 'hi' }, principal);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already has a running agent/);
  });
});

describe('workspace detail — archive (gated)', () => {
  it('tears down and archives a reviewed workspace', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    await module.workspaceDiff(workspace.workspaceId); // → awaiting_review

    const result = await module.archiveWorkspace(workspace.workspaceId, principal);
    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('archived');
    expect(result.value?.worktreePath).toBeUndefined();
  });

  it('archiving an archived workspace is a no-op success', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunningWorkspace(module);
    await module.workspaceDiff(workspace.workspaceId);
    await module.archiveWorkspace(workspace.workspaceId, principal);
    const again = await module.archiveWorkspace(workspace.workspaceId, principal);
    expect(again.ok).toBe(true);
    expect(again.value?.state).toBe('archived');
  });
});

describe('workspace detail — governance deny', () => {
  it('denies every detail write when the gate denies', async () => {
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate: makeGate('deny'),
    });
    const preview = await module.setPreviewUrl('ws_x', 'http://localhost:3000/', principal);
    const archive = await module.archiveWorkspace('ws_x', principal);
    const message = await module.sendWorkspaceMessage('ws_x', { text: 'hi' }, principal);
    const merge = await module.mergeWorkspace('ws_x', {}, principal);
    const pr = await module.createWorkspacePr('ws_x', { title: 't' }, principal);
    for (const result of [preview, archive, message, merge, pr]) {
      expect(result.ok).toBe(false);
      expect(result.verdict.effect).toBe('deny');
    }
  });
});
