import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance, FileAuditLog } from '@recoder/governance';
import { createCommandGateAdapter, type CommandGateApprovalPort } from './command-gate.adapter.js';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-command-gate-adapter-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createCommandGateAdapter', () => {
  it('allows an ordinary command and runs the caller-supplied deliver()', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const adapter = createCommandGateAdapter({ governance, auditLog });

    let delivered = false;
    const outcome = await adapter.gate({
      actorId: 'user-1',
      command: 'ls -la',
      deliver: async () => {
        delivered = true;
      },
    });

    expect(outcome.allowed).toBe(true);
    expect(delivered).toBe(true);
  });

  it('denies a dangerous command with no approval channel configured and never delivers', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const adapter = createCommandGateAdapter({ governance, auditLog }); // no `approvals`

    let delivered = false;
    const outcome = await adapter.gate({
      actorId: 'user-1',
      command: 'rm -rf /tmp/some-dangerous-target',
      deliver: async () => {
        delivered = true;
      },
    });

    expect(outcome.allowed).toBe(false);
    expect(delivered).toBe(false);
  });

  it('opens a durable, UI-visible approval record for a fresh needs_approval verdict', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const requests: Array<{ action: string; target: string; requestedBy: string }> = [];
    const approvals: CommandGateApprovalPort = {
      async request(p) {
        requests.push({ action: p.action, target: p.target, requestedBy: p.requestedBy });
        return { id: 'approval-1' };
      },
    };
    const adapter = createCommandGateAdapter({ governance, auditLog, approvals });

    const outcome = await adapter.gate({
      actorId: 'user-1',
      command: 'rm -rf /tmp/some-dangerous-target',
      deliver: async () => {},
    });

    expect(outcome.allowed).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0].action).toBe('command.run');
    expect(requests[0].target).toBe('rm -rf /tmp/some-dangerous-target');
  });

  it('rethrows the real delivery error when policy allows but deliver() faults (never the generic wrapper message)', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const adapter = createCommandGateAdapter({ governance, auditLog });

    await expect(
      adapter.gate({
        actorId: 'user-1',
        command: 'ls -la',
        deliver: async () => {
          throw new Error('loom socket ECONNRESET');
        },
      }),
    ).rejects.toThrow('loom socket ECONNRESET');
  });

  it('never invokes the refuse-default executor (every call routes through the per-request deliver())', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const adapter = createCommandGateAdapter({ governance, auditLog });

    // If the adapter ever fell back to CommandGate's own default executor
    // instead of the per-request one, this would throw the guard's own
    // "invoked without a per-request executor" error instead of completing.
    const outcome = await adapter.gate({
      actorId: 'user-1',
      command: 'echo hi',
      deliver: async () => {},
    });

    expect(outcome.allowed).toBe(true);
  });
});
