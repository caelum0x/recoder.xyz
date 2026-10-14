import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance, FileAuditLog } from '@recoder/governance';
import {
  createT3TerminalCommandGate,
  type T3CommandGateApprovalPort,
} from '../src/terminal-command-gate.adapter';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-t3-bridge-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A no-op approval port: records nothing, always "rejects" (fail-closed, no record). */
function noopApprovals(): T3CommandGateApprovalPort {
  return {
    async request() {
      return { id: 'unused' };
    },
  };
}

describe('createT3TerminalCommandGate — allow path', () => {
  it('allows an ordinary terminal write and runs the caller-supplied deliver()', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    let delivered = false;
    const outcome = await bridge.gate({
      actorId: 'agent-1',
      write: { threadId: 'thread-1', terminalId: 'term-1', data: 'ls -la\n' },
      deliver: async () => {
        delivered = true;
      },
    });

    assert.equal(outcome.allowed, true);
    assert.equal(delivered, true);
  });

  it('records the full decision + delivery trail in the durable audit log', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    await bridge.gate({
      actorId: 'agent-1',
      write: { threadId: 'thread-1', terminalId: 'term-1', data: 'echo hi\n' },
      deliver: async () => {},
    });

    const entries = auditLog.all();
    assert.ok(entries.length >= 2);
    assert.equal(entries[0].action, 'decision.made');
    assert.equal(entries[0].outcome, 'allow');
    assert.equal(auditLog.verify().ok, true);
  });
});

describe('createT3TerminalCommandGate — deny / needs_approval path', () => {
  it('denies a dangerous terminal write with no approval opened and never delivers', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    let delivered = false;
    const outcome = await bridge.gate({
      actorId: 'agent-1',
      write: { threadId: 'thread-1', terminalId: 'term-1', data: 'rm -rf /tmp/some-dangerous-target\n' },
      deliver: async () => {
        delivered = true;
      },
    });

    assert.equal(outcome.allowed, false);
    assert.equal(delivered, false);
  });

  it('opens a durable, UI-visible approval record for a fresh needs_approval verdict', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const requests: Array<{ action: string; target: string; requestedBy: string }> = [];
    const approvals: T3CommandGateApprovalPort = {
      async request(p) {
        requests.push({ action: p.action, target: p.target, requestedBy: p.requestedBy });
        return { id: 'approval-1' };
      },
    };
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals });

    const outcome = await bridge.gate({
      actorId: 'agent-1',
      write: { threadId: 'thread-1', terminalId: 'term-1', data: 'rm -rf /tmp/some-dangerous-target\n' },
      deliver: async () => {},
    });

    assert.equal(outcome.allowed, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].action, 'terminal.write');
    assert.equal(requests[0].target, 'rm -rf /tmp/some-dangerous-target\n');
  });

  it('defaults to a real ApprovalService-backed port when none is injected', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    // No `approvals` supplied — exercises `createApprovalPortFromApprovalService`'s
    // default wiring over a fresh `@recoder/agent-os` `ApprovalService`.
    const bridge = createT3TerminalCommandGate({ governance, auditLog });

    const outcome = await bridge.gate({
      actorId: 'agent-1',
      write: { threadId: 'thread-1', terminalId: 'term-1', data: 'rm -rf /tmp/some-dangerous-target\n' },
      deliver: async () => {},
    });

    // Still deny-now (no human has resolved the approval yet) — but it must
    // not throw while opening the real ApprovalService-backed record.
    assert.equal(outcome.allowed, false);
  });
});

describe('createT3TerminalCommandGate — delivery faults', () => {
  it('rethrows the real delivery error when policy allows but deliver() faults', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    await assert.rejects(
      bridge.gate({
        actorId: 'agent-1',
        write: { threadId: 'thread-1', terminalId: 'term-1', data: 'echo hi\n' },
        deliver: async () => {
          throw new Error('t3 terminal socket ECONNRESET');
        },
      }),
      /t3 terminal socket ECONNRESET/,
    );
  });
});
