import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance, FileAuditLog } from '@recoder/governance';
import { createT3TerminalCommandGate, type T3CommandGateApprovalPort } from '../src/terminal-command-gate.adapter';
import { createGovernedPtyProcess } from '../src/governed-pty-adapter';
import { createChildProcessPtyProcess } from '../src/child-process-pty-adapter';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-t3-bridge-governed-pty-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function noopApprovals(): T3CommandGateApprovalPort {
  return {
    async request() {
      return { id: 'unused' };
    },
  };
}

/** Collects every data chunk a `PtyProcessLike.onData` subscriber receives, for assertions. */
function captureOutput(target: { onData(cb: (data: string) => void): () => void }) {
  let buffer = '';
  target.onData((chunk) => {
    buffer += chunk;
  });
  return () => buffer;
}

/** Polls until `predicate()` is true or the timeout elapses — process stdout is async. */
async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitUntil: timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('createGovernedPtyProcess — engine selection runs a real trivial command', () => {
  it('selects a real child-process-backed engine, writes through the gate, and the engine actually executes the command', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    // The "engine" — a real subprocess, not a stub.
    const realProcess = createChildProcessPtyProcess({ shell: '/bin/sh' });
    const getOutput = captureOutput(realProcess);

    const governed = createGovernedPtyProcess({
      process: realProcess,
      gate,
      context: { threadId: 'thread-engine-selection', terminalId: 'term-1', actorId: 'agent-1' },
    });

    assert.equal(governed.pid, realProcess.pid);

    governed.write('echo engine-selection-marker-42\n');
    await governed.drain();
    await waitUntil(() => getOutput().includes('engine-selection-marker-42'));

    assert.ok(getOutput().includes('engine-selection-marker-42'), 'the real engine must have executed the trivial command');

    // And the write that reached the real engine was itself gated — not a
    // bypass. The allow decision is in the durable audit trail.
    const entries = auditLog.all();
    const allowEntry = entries.find((e) => e.action === 'decision.made' && e.outcome === 'allow');
    assert.ok(allowEntry, 'an allow decision must be recorded for the delivered write');

    governed.kill();
  });
});

describe('createGovernedPtyProcess — governance interception', () => {
  it('a dangerous write is intercepted by CommandGate and never reaches the real engine', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    const realProcess = createChildProcessPtyProcess({ shell: '/bin/sh' });
    const getOutput = captureOutput(realProcess);

    const governed = createGovernedPtyProcess({
      process: realProcess,
      gate,
      context: { threadId: 'thread-governance', terminalId: 'term-1', actorId: 'agent-1' },
    });

    governed.write('rm -rf /tmp/some-dangerous-target\n');
    await governed.drain();

    // Prove the real engine never ran the dangerous command: follow up with
    // a benign, distinctly-marked write and confirm ONLY that marker shows
    // up — never evidence the dangerous command was piped into the shell.
    governed.write('echo governance-interception-proof-7\n');
    await governed.drain();
    await waitUntil(() => getOutput().includes('governance-interception-proof-7'));

    assert.ok(!getOutput().includes('some-dangerous-target'), 'the dangerous write must never reach the real engine');
    assert.ok(getOutput().includes('governance-interception-proof-7'), 'the benign write after it must still be delivered normally');

    const entries = auditLog.all();
    const denyEntry = entries.find((e) => e.action === 'decision.made' && e.outcome !== 'allow');
    assert.ok(denyEntry, 'a non-allow decision must be recorded for the intercepted write');

    governed.kill();
  });

  it('serializes writes through the gate in order (no reordering races)', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = createT3TerminalCommandGate({ governance, auditLog, approvals: noopApprovals() });

    const delivered: string[] = [];
    const stubProcess = {
      pid: 123,
      write(data: string) {
        delivered.push(data);
      },
      resize() {},
      kill() {},
      onData() {
        return () => {};
      },
      onExit() {
        return () => {};
      },
    };

    const governed = createGovernedPtyProcess({
      process: stubProcess,
      gate,
      context: { threadId: 'thread-order', terminalId: 'term-1', actorId: 'agent-1' },
    });

    governed.write('echo one\n');
    governed.write('echo two\n');
    governed.write('echo three\n');
    await governed.drain();

    assert.deepEqual(delivered, ['echo one\n', 'echo two\n', 'echo three\n']);
  });
});
