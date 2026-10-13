import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Governance } from '../../src/governance';
import { FileAuditLog } from '../../src/audit/file-audit-log';
import { CommandGate, type CommandExecutor } from '../../src/commands/command-gate';
import { makeAgent, makeTask } from '../fixtures';

let dir: string;
let auditPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-command-gate-'));
  auditPath = join(dir, 'audit.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A read-only agent: no shell, no git-write, default-deny files. */
function readOnlyAgent() {
  return makeAgent();
}

/**
 * An agent allowed to run shell commands (workspace_write mode) but with no
 * other elevated grants — enough to let ordinary commands through, not enough
 * to satisfy a danger_full_access-gated destructive command.
 */
function shellAgent() {
  return makeAgent({
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: true,
      allowGitWrite: false,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
    },
  });
}

/** An agent with full shell + git-write + no write-lock requirement -> danger_full_access mode. */
function fullAccessAgent() {
  return makeAgent({
    permissions: {
      defaultFileEffect: 'allow',
      pathRules: [],
      toolRules: [],
      allowNetwork: false,
      allowShell: true,
      allowGitWrite: true,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: false,
    },
  });
}

function fakeExecutor(result: { stdout: string; stderr: string; exitCode: number }): CommandExecutor {
  const calls: Array<{ command: string; cwd?: string }> = [];
  const executor: CommandExecutor & { calls: typeof calls } = Object.assign(
    async (command: string, cwd?: string) => {
      calls.push({ command, cwd });
      return result;
    },
    { calls },
  );
  return executor;
}

describe('CommandGate — allow path', () => {
  it('executes an allowed command and records the full trail in the audit log', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: 'hi\n', stderr: '', exitCode: 0 });
    const gate = new CommandGate({ governance, auditLog, executor });

    const result = await gate.gate({
      actor: shellAgent(),
      task: makeTask(),
      command: 'echo hi',
    });

    assert.equal(result.status, 'executed');
    assert.equal(result.verdict.effect, 'allow');
    assert.equal(result.execution?.stdout, 'hi\n');
    assert.equal((executor as unknown as { calls: unknown[] }).calls.length, 1);

    const entries = auditLog.all();
    assert.ok(entries.length >= 2); // decision.made + tool.invoked
    assert.equal(entries[0].action, 'decision.made');
    assert.equal(entries[0].outcome, 'allow');
    assert.equal(entries.at(-1)?.action, 'tool.invoked');
    assert.equal(entries.at(-1)?.outcome, 'success');
    assert.equal(auditLog.verify().ok, true);
  });

  it('records a failure outcome when the executed command exits non-zero', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: '', stderr: 'boom', exitCode: 1 });
    const gate = new CommandGate({ governance, auditLog, executor });

    const result = await gate.gate({ actor: shellAgent(), command: 'false' });

    assert.equal(result.status, 'executed');
    assert.equal(result.execution?.exitCode, 1);
    const last = auditLog.all().at(-1);
    assert.equal(last?.outcome, 'failure');
  });
});

describe('CommandGate — deny path', () => {
  it('denies a write-mutating command under read_only mode and never executes it', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: '', stderr: '', exitCode: 0 });
    const gate = new CommandGate({ governance, auditLog, executor });

    const result = await gate.gate({
      actor: readOnlyAgent(), // allowShell:false -> read_only mode
      command: 'git commit -m "oops"',
    });

    assert.equal(result.status, 'denied');
    assert.equal(result.verdict.effect, 'deny');
    assert.equal((executor as unknown as { calls: unknown[] }).calls.length, 0, 'denied command must never execute');

    const entries = auditLog.all();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, 'deny');
    assert.equal(auditLog.verify().ok, true);
  });
});

describe('CommandGate — needs_approval path', () => {
  it('fails closed (denies, never executes) when no approval prompt is configured', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: '', stderr: '', exitCode: 0 });
    const gate = new CommandGate({ governance, auditLog, executor }); // no approvalPrompt

    const result = await gate.gate({
      actor: fullAccessAgent(),
      command: 'rm -rf /tmp/some-dangerous-target',
    });

    assert.equal(result.verdict.effect, 'needs_approval');
    assert.equal(result.status, 'denied');
    assert.equal(result.approvalDecision, 'rejected');
    assert.equal((executor as unknown as { calls: unknown[] }).calls.length, 0);

    const entries = auditLog.all();
    assert.equal(entries.at(-1)?.action, 'approval.resolved');
    assert.equal(entries.at(-1)?.outcome, 'deny');
  });

  it('executes after the inline approval prompt approves', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: 'removed\n', stderr: '', exitCode: 0 });
    const prompted: Array<{ command: string; tier: string }> = [];
    const gate = new CommandGate({
      governance,
      auditLog,
      executor,
      approvalPrompt: async (details) => {
        prompted.push({ command: details.command, tier: details.tier });
        return 'approved';
      },
    });

    const result = await gate.gate({
      actor: fullAccessAgent(),
      requestedBy: 'owner@example.com',
      command: 'rm -rf /tmp/some-dangerous-target',
    });

    assert.equal(result.status, 'executed');
    assert.equal(result.approvalDecision, 'approved');
    assert.equal(prompted.length, 1);
    assert.equal(prompted[0].command, 'rm -rf /tmp/some-dangerous-target');
    assert.equal((executor as unknown as { calls: unknown[] }).calls.length, 1);

    const actions = auditLog.all().map((e) => e.action);
    assert.deepEqual(actions, ['decision.made', 'approval.requested', 'approval.resolved', 'tool.invoked']);
    assert.equal(auditLog.verify().ok, true);
  });

  it('never executes when the inline approval prompt rejects', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const executor = fakeExecutor({ stdout: '', stderr: '', exitCode: 0 });
    const gate = new CommandGate({
      governance,
      auditLog,
      executor,
      approvalPrompt: async () => 'rejected',
    });

    const result = await gate.gate({
      actor: fullAccessAgent(),
      command: 'rm -rf /tmp/some-dangerous-target',
    });

    assert.equal(result.status, 'denied');
    assert.equal(result.approvalDecision, 'rejected');
    assert.equal((executor as unknown as { calls: unknown[] }).calls.length, 0);
  });
});

describe('CommandGate — audit log integrity', () => {
  it('the on-disk audit log survives a full gate lifecycle and verifies end to end', async () => {
    const governance = await Governance.create();
    const auditLog = FileAuditLog.open(auditPath);
    const gate = new CommandGate({
      governance,
      auditLog,
      executor: fakeExecutor({ stdout: '', stderr: '', exitCode: 0 }),
      approvalPrompt: async () => 'approved',
    });

    await gate.gate({ actor: readOnlyAgent(), command: 'echo ok' });
    await gate.gate({ actor: readOnlyAgent(), command: 'git commit -m x' });
    await gate.gate({ actor: fullAccessAgent(), command: 'rm -rf /tmp/danger' });

    const reopened = FileAuditLog.open(auditPath);
    assert.ok(reopened.length() >= 5);
    assert.equal(reopened.verify().ok, true);
  });
});
