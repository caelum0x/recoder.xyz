/**
 * sendReviewComments — the review→agent roundtrip that folds line-anchored
 * comments into ONE prompt and STEERS it into the live session.
 *
 * Proves: an allowed send composes the structured prompt and delivers it through
 * the SAME governed steer path (transport receives the composed keys with submit,
 * an audit is sealed under `workspace.steer`); a payload with no valid comments
 * composes to an empty prompt and is refused truthfully WITHOUT touching the
 * transport; a gate deny blocks delivery. Governance is inherited from
 * steerWorkspace — this test proves the composition + delegation, not a second
 * gate.
 */
import { describe, it, expect } from 'vitest';
import type { ContinueRunInput, SubstrateHandle } from '@recoder/substrate';
import {
  composeConductor,
  FakeSubstrate,
  FakeSteerTransport,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from '../__fixtures__/harness.js';

/** A FakeSubstrate that records the prompt its most recent continue-run received. */
class RecordingSubstrate extends FakeSubstrate {
  lastContinuePrompt: string | undefined;
  override async continueRun(handle: SubstrateHandle, input: ContinueRunInput): Promise<SubstrateHandle> {
    this.lastContinuePrompt = input.prompt;
    return super.continueRun(handle, input);
  }
}

describe('conductor sendReviewComments', () => {
  it('composes line-anchored comments into one steered prompt and seals an audit', async () => {
    const gate = makeGate('allow');
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    const workspace = created.value!;

    const result = await module.sendReviewComments(
      {
        workspaceId: workspace.workspaceId,
        comments: [
          { file: 'src/a.ts', line: 12, body: 'extract this helper' },
          { file: 'src/b.ts', body: 'needs a test' },
        ],
      },
      makePrincipal('user_bob'),
    );

    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    const sent = transport.sent[0]!;
    expect(sent.sessionName).toBe(workspace.sessionName);
    expect(sent.submit).toBe(true);
    expect(sent.keys).toContain('these 2 review comments');
    expect(sent.keys).toContain('1. src/a.ts:12 — extract this helper');
    expect(sent.keys).toContain('2. src/b.ts — needs a test');

    const audit = gate.audits.find((a) => a.action === 'workspace.steer');
    expect(audit?.actorId).toBe('user_bob');
    expect(audit?.effect).toBe('allow');
  });

  it('refuses truthfully when no comment survives parsing (empty prompt, transport untouched)', async () => {
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());

    const result = await module.sendReviewComments(
      { workspaceId: created.value!.workspaceId, comments: [{ file: '', body: '' }] },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/non-empty/);
    expect(transport.sent).toHaveLength(0);
  });

  it('blocks delivery when the gate denies — the transport is never touched', async () => {
    const gate = makeGate('allow');
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    gate.setEffect('deny');

    const result = await module.sendReviewComments(
      { workspaceId: created.value!.workspaceId, comments: [{ file: 'a.ts', line: 1, body: 'fix' }] },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(transport.sent).toHaveLength(0);
  });
});

/**
 * The REAL review flow: an agent finishes and the workspace parks in
 * `awaiting_review` — there is no live turn to steer. A posted review comment
 * must still feed the agent, so it drives a NEW gated run in the worktree via the
 * continue/message path (a message = changes requested → running), with the
 * composed `file:line — comment` prompt as the follow-up instruction. This is the
 * wiring the parity audit found missing: a comment on a reviewed (non-running)
 * workspace previously died with "workspace is awaiting_review, not running".
 */
describe('conductor sendReviewComments — review-state continue path', () => {
  it('drives a NEW gated run in the worktree when the workspace is awaiting_review (not running)', async () => {
    const gate = makeGate('allow');
    const substrate = new RecordingSubstrate();
    const { module } = composeConductor({ substrates: [substrate], gate });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    const workspace = created.value!;
    // The agent finished → the workspace parks in awaiting_review (no live turn).
    await module.advanceWorkspaceState(workspace.workspaceId, 'awaiting_review', makePrincipal());

    const result = await module.sendReviewComments(
      {
        workspaceId: workspace.workspaceId,
        comments: [
          { file: 'src/a.ts', line: 12, body: 'extract this helper' },
          { file: 'src/b.ts', body: 'needs a test' },
        ],
      },
      makePrincipal('user_bob'),
    );

    expect(result.ok).toBe(true);
    // Delivered as a NEW run (not a steer) — the loop is truly wired for review state.
    expect(result.value?.delivery).toBe('run');
    expect(typeof result.value?.runId).toBe('string');
    // THE LOOP: the composed review prompt became the follow-up run's instruction.
    expect(substrate.lastContinuePrompt).toContain('these 2 review comments');
    expect(substrate.lastContinuePrompt).toContain('1. src/a.ts:12 — extract this helper');
    expect(substrate.lastContinuePrompt).toContain('2. src/b.ts — needs a test');
    // The follow-up run went through the SAME governance gate + audit (workspace.message).
    const audit = gate.audits.find((a) => a.action === 'workspace.message');
    expect(audit?.actorId).toBe('user_bob');
    expect(audit?.effect).toBe('allow');
    // review → changes_requested → running (a message is a change request).
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
  });

  it('blocks the follow-up run when the gate denies — no new run is started', async () => {
    const gate = makeGate('allow');
    const substrate = new RecordingSubstrate();
    const { module } = composeConductor({ substrates: [substrate], gate });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    await module.advanceWorkspaceState(created.value!.workspaceId, 'awaiting_review', makePrincipal());
    gate.setEffect('deny');

    const result = await module.sendReviewComments(
      { workspaceId: created.value!.workspaceId, comments: [{ file: 'a.ts', line: 1, body: 'fix' }] },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    // The gate blocked BEFORE any continue-run touched the substrate.
    expect(substrate.lastContinuePrompt).toBeUndefined();
    // State of record is unchanged — never a false transition.
    expect((await module.getWorkspace(created.value!.workspaceId))?.state).toBe('awaiting_review');
  });
});
