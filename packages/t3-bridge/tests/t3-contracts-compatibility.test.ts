/**
 * This is the one test in the package that imports the REAL vendored
 * `@t3tools/contracts` at runtime (not just as a type) — it proves
 * `createT3TerminalCommandGate` genuinely accepts a value decoded by t3's
 * own `effect/Schema` `TerminalWriteInput` schema (the actual wire contract
 * a t3-backed agent session's terminal write would carry), not just a
 * hand-shaped object that happens to satisfy this package's local
 * `T3TerminalWriteRequest` type.
 *
 * Scope note (see docs/T3CODE-FORK.md section 9 / plans/recoder.md "Forks
 * imported 2026-10-15"): `third_party/t3code/apps/server` (the actual `t3`
 * Effect-TS session runtime) is NOT yet a live build target — standing up
 * its full Effect app-server process is out of scope for this bridge. This
 * test is the honest substitute: it exercises the REAL contract schema from
 * the REAL vendored package, decoded exactly as `apps/server` would decode
 * an incoming RPC payload, and confirms that decoded value reaches
 * Recoder's own `CommandGate` → `needs_approval` → `ApprovalService`
 * pipeline for a destructive command, and is denied-by-default
 * (fail-closed) when no human has resolved the approval — i.e. "a
 * t3-contracts-shaped terminal write hits the approval gate" is proven at
 * the bridge boundary, independent of whether `apps/server` itself is
 * running.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Schema from 'effect/Schema';
import { TerminalWriteInput } from '@t3tools/contracts';
import { Governance, FileAuditLog } from '@recoder/governance';
import {
  createT3TerminalCommandGate,
  type T3CommandGateApprovalPort,
} from '../src/terminal-command-gate.adapter';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-t3-bridge-contracts-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const decodeTerminalWrite = Schema.decodeUnknownSync(TerminalWriteInput);

describe('t3-bridge <-> @t3tools/contracts compatibility', () => {
  it('decodes a real TerminalWriteInput payload exactly as apps/server would', () => {
    const decoded = decodeTerminalWrite({
      threadId: 'thread-abc123',
      terminalId: 'term-1',
      data: 'echo hello-from-t3\n',
    });

    assert.equal(decoded.threadId, 'thread-abc123');
    assert.equal(decoded.terminalId, 'term-1');
    assert.equal(decoded.data, 'echo hello-from-t3\n');
  });

  it('rejects a malformed payload the same way apps/server would reject it over RPC', () => {
    assert.throws(() => decodeTerminalWrite({ threadId: '', terminalId: 'term-1', data: 'ls\n' }));
    assert.throws(() => decodeTerminalWrite({ threadId: 'thread-1', terminalId: 'term-1', data: '' }));
  });

  it('a real-schema-decoded destructive terminal write hits the approval gate and is denied-by-default', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const opened: Array<{ target: string; riskTier: string }> = [];
    const approvals: T3CommandGateApprovalPort = {
      async request(p) {
        opened.push({ target: p.target, riskTier: p.riskTier });
        return { id: 'approval-contracts-1' };
      },
    };
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals });

    // Exactly what `apps/server` would hand the governance seam after
    // decoding an incoming `terminal.write` RPC call from a t3 session.
    const write = decodeTerminalWrite({
      threadId: 'thread-session-42',
      terminalId: 'term-1',
      data: 'rm -rf /tmp/some-dangerous-target\n',
    });

    let delivered = false;
    const outcome = await bridge.gate({
      actorId: 't3-session-42',
      write,
      taskId: write.threadId,
      deliver: async () => {
        delivered = true;
      },
    });

    assert.equal(outcome.allowed, false, 'a destructive command must never be allowed without a resolved approval');
    assert.equal(delivered, false, 'delivery into the t3 terminal must never happen before approval');
    assert.equal(opened.length, 1, 'the needs_approval verdict must open exactly one durable approval record');
    assert.equal(opened[0].target, 'rm -rf /tmp/some-dangerous-target\n');

    const entries = auditLog.all();
    assert.ok(
      entries.some((e) => e.action === 'approval.resolved' && e.outcome === 'deny'),
      'the fail-closed denial must be sealed into the durable audit log',
    );
  });

  it('a real-schema-decoded ordinary terminal write is allowed and delivered without opening an approval', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const opened: unknown[] = [];
    const approvals: T3CommandGateApprovalPort = {
      async request(p) {
        opened.push(p);
        return { id: 'unused' };
      },
    };
    const bridge = createT3TerminalCommandGate({ governance, auditLog, approvals });

    const write = decodeTerminalWrite({
      threadId: 'thread-session-43',
      terminalId: 'term-1',
      data: 'git status\n',
    });

    let delivered = false;
    const outcome = await bridge.gate({
      actorId: 't3-session-43',
      write,
      deliver: async () => {
        delivered = true;
      },
    });

    assert.equal(outcome.allowed, true);
    assert.equal(delivered, true);
    assert.equal(opened.length, 0);
  });
});
