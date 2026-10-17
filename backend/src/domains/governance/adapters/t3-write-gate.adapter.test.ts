import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance, FileAuditLog } from '@recoder/governance';
import {
  createT3WriteCommandGate,
  type T3WriteGateApprovalPort,
} from './t3-write-gate.adapter.js';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-t3-write-gate-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Records every approval request this test's gate opened; always "rejects" (fail-closed, no live wait). */
function recordingApprovals(): T3WriteGateApprovalPort & { requests: unknown[] } {
  const requests: unknown[] = [];
  return {
    requests,
    async request(params) {
      requests.push(params);
      return { id: `approval-${requests.length}` };
    },
  };
}

describe('createT3WriteCommandGate — allow path', () => {
  it('allows an ordinary pr.link write/merge action', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3WriteCommandGate({ governance, auditLog });

    const outcome = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.link',
      target: 'github.com/acme/widgets#42',
      taskId: 'task-1',
    });

    assert.equal(outcome.allowed, true);
  });

  it('records the full decision trail in the durable audit log, tagged with the t3 action/target', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3WriteCommandGate({ governance, auditLog });

    await gate.gate({
      actorId: 't3-session-1',
      action: 'worktree.create',
      target: '/repo/worktrees/wt-a',
      taskId: 'task-1',
    });

    const entries = auditLog.all();
    assert.ok(entries.length >= 2);
    assert.equal(entries[0].action, 'decision.made');
    assert.equal(entries[0].outcome, 'allow');
    assert.equal(auditLog.verify().ok, true);
  });
});

describe('createT3WriteCommandGate — deny / needs_approval path', () => {
  it('denies a dangerous write/merge target and opens no approval when no port is injected', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3WriteCommandGate({ governance, auditLog });

    const outcome = await gate.gate({
      actorId: 't3-session-1',
      action: 'checkpoint.revert',
      target: 'rm -rf /tmp/some-dangerous-target',
      taskId: 'task-1',
    });

    assert.equal(outcome.allowed, false);
  });

  it('opens a durable, UI-visible approval record for a fresh needs_approval verdict', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const approvals = recordingApprovals();
    const gate = createT3WriteCommandGate({ governance, auditLog, approvals });

    const outcome = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.merge',
      target: 'rm -rf /tmp/some-dangerous-target',
      taskId: 'task-1',
    });

    assert.equal(outcome.allowed, false);
    assert.equal(approvals.requests.length, 1);
  });

  it('never fabricates an allow on a second identical dangerous request without a resolved approval', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3WriteCommandGate({ governance, auditLog });

    const first = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.merge',
      target: 'rm -rf /tmp/some-dangerous-target',
      taskId: 'task-1',
    });
    const second = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.merge',
      target: 'rm -rf /tmp/some-dangerous-target',
      taskId: 'task-1',
    });

    assert.equal(first.allowed, false);
    assert.equal(second.allowed, false);
  });

  it('an approval opened for target A does not clear target B — proof required by docs/RECODER-T3CODE-COMPOSITION.md section 5', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const approvals = recordingApprovals();
    const gate = createT3WriteCommandGate({ governance, auditLog, approvals });

    const targetA = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.merge',
      target: 'rm -rf /tmp/target-a',
      taskId: 'task-1',
    });
    // A DIFFERENT dangerous target, same actor/task — must independently
    // deny and independently open its OWN approval record, never ride on
    // whatever decision target A got.
    const targetB = await gate.gate({
      actorId: 't3-session-1',
      action: 'pr.merge',
      target: 'rm -rf /tmp/target-b',
      taskId: 'task-1',
    });

    assert.equal(targetA.allowed, false);
    assert.equal(targetB.allowed, false);
    assert.equal(approvals.requests.length, 2);
    const targets = approvals.requests.map((r) => (r as { target: string }).target);
    assert.notEqual(targets[0], targets[1]);
  });
});
