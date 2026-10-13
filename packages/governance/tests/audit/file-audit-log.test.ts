import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAuditLog } from '../../src/audit/file-audit-log';
import { AuditTamperError } from '../../src/errors';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recoder-audit-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FileAuditLog', () => {
  it('starts empty and creates the file lazily on first append', () => {
    const file = join(dir, 'audit.jsonl');
    const log = FileAuditLog.open(file);
    assert.equal(log.length(), 0);

    const entry = log.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'first entry',
      outcome: 'allow',
    });

    assert.equal(entry.seq, 0);
    assert.equal(log.length(), 1);
    assert.ok(readFileSync(file, 'utf8').includes('first entry'));
  });

  it('chains successive appends and verifies the full chain', () => {
    const file = join(dir, 'audit.jsonl');
    const log = FileAuditLog.open(file);
    for (let i = 0; i < 5; i += 1) {
      log.append({
        timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        actor: 'agent-1',
        action: 'decision.made',
        detail: `entry ${i}`,
        outcome: 'allow',
      });
    }
    assert.equal(log.length(), 5);
    const result = log.verify();
    assert.equal(result.ok, true);
  });

  it('persists across process restarts: reopening continues the SAME chain', () => {
    const file = join(dir, 'audit.jsonl');
    const first = FileAuditLog.open(file);
    first.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'before restart',
      outcome: 'allow',
    });
    const tipBefore = first.tipHash();

    // Simulate a process restart: open a brand new instance over the same file.
    const second = FileAuditLog.open(file);
    assert.equal(second.length(), 1);
    assert.equal(second.tipHash(), tipBefore);

    const appended = second.append({
      timestamp: '2026-01-01T00:01:00.000Z',
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'after restart',
      outcome: 'allow',
    });
    assert.equal(appended.seq, 1);
    assert.equal(appended.prevHash, tipBefore);
    assert.equal(second.verify().ok, true);
  });

  it('throws AuditTamperError on open when a prior entry was edited on disk', () => {
    const file = join(dir, 'audit.jsonl');
    const log = FileAuditLog.open(file);
    log.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'original',
      outcome: 'allow',
    });

    // Tamper: rewrite the single line with a different `detail` but keep the
    // same (now-stale) hash fields, simulating an attacker editing history.
    const raw = readFileSync(file, 'utf8').trim();
    const parsed = JSON.parse(raw);
    parsed.detail = 'tampered';
    writeFileSync(file, `${JSON.stringify(parsed)}\n`, 'utf8');

    assert.throws(() => FileAuditLog.open(file), AuditTamperError);
  });

  it('verify() detects out-of-band tampering between appends without reopening', () => {
    const file = join(dir, 'audit.jsonl');
    const log = FileAuditLog.open(file);
    log.append({
      timestamp: '2026-01-01T00:00:00.000Z',
      actor: 'agent-1',
      action: 'decision.made',
      detail: 'original',
      outcome: 'allow',
    });
    assert.equal(log.verify().ok, true);

    const raw = readFileSync(file, 'utf8').trim();
    const parsed = JSON.parse(raw);
    parsed.outcome = 'deny';
    writeFileSync(file, `${JSON.stringify(parsed)}\n`, 'utf8');

    const result = log.verify();
    assert.equal(result.ok, false);
  });

  it('exposes no mutate/delete API — append is the only way to add state', () => {
    const file = join(dir, 'audit.jsonl');
    const log = FileAuditLog.open(file);
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(log));
    assert.ok(!proto.some((name) => /delete|remove|clear|truncate/i.test(name)));
  });
});
