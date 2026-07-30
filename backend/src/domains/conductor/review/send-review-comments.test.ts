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
import {
  composeConductor,
  FakeSubstrate,
  FakeSteerTransport,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from '../__fixtures__/harness.js';

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
