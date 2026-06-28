import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENESIS_PREV_HASH,
  computeEntryHash,
  sealEntry,
  verifyIntegrity,
  verifyPrefix,
} from '../../src/audit/merkle-verifier';
import { InMemoryAuditStore } from '../../src/audit/audit-store';
import type { AuditEntry, AuditInput } from '../../src/domain/audit-entry';

function input(detail: string, actor = 'agent-1'): AuditInput {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    actor,
    action: 'decision.made',
    detail,
    outcome: 'allow',
  };
}

describe('merkle-verifier', () => {
  it('computes a deterministic 64-hex SHA-256 hash', () => {
    const h = computeEntryHash({
      seq: 0,
      timestamp: 't',
      actor: 'a',
      action: 'decision.made',
      detail: 'd',
      outcome: 'allow',
      prevHash: GENESIS_PREV_HASH,
    });
    assert.match(h, /^[0-9a-f]{64}$/);
    // determinism
    const h2 = computeEntryHash({
      seq: 0,
      timestamp: 't',
      actor: 'a',
      action: 'decision.made',
      detail: 'd',
      outcome: 'allow',
      prevHash: GENESIS_PREV_HASH,
    });
    assert.equal(h, h2);
  });

  it('different content yields a different hash (collision resistance proxy)', () => {
    const base = { seq: 0, timestamp: 't', actor: 'a', action: 'decision.made', detail: 'd', outcome: 'allow', prevHash: GENESIS_PREV_HASH };
    const a = computeEntryHash(base);
    const b = computeEntryHash({ ...base, detail: 'd2' });
    const c = computeEntryHash({ ...base, outcome: 'deny' });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it('the genesis entry links to the zero sentinel', () => {
    const e = sealEntry(input('first'), 0, GENESIS_PREV_HASH);
    assert.equal(e.prevHash, GENESIS_PREV_HASH);
    assert.equal(e.seq, 0);
  });

  it('verifies a valid chain built by the store', () => {
    const store = new InMemoryAuditStore();
    store.record(input('a'));
    store.record(input('b'));
    store.record(input('c'));
    const result = verifyIntegrity(store.all());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.length, 3);
      assert.equal(result.tipHash, store.tipHash());
    }
  });

  it('detects tampered detail content', () => {
    const store = new InMemoryAuditStore();
    store.record(input('a'));
    store.record(input('b'));
    store.record(input('c'));
    const entries = store.all() as AuditEntry[];
    // tamper: change detail but keep the stored hash (forger forgot to re-hash)
    const tampered = entries.map((e, i) => (i === 1 ? { ...e, detail: 'EVIL' } : e));
    const result = verifyIntegrity(tampered);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.brokenAtSeq, 1);
  });

  it('detects a re-hashed middle entry (breaks the forward link)', () => {
    const store = new InMemoryAuditStore();
    store.record(input('a'));
    store.record(input('b'));
    store.record(input('c'));
    const entries = store.all() as AuditEntry[];
    // attacker re-hashes entry 1 with new content so entry 1 is self-consistent,
    // but entry 2's prevHash still points to the OLD hash -> link breaks at 2.
    const forgedDetail = 'FORGED';
    const forgedHash = computeEntryHash({
      seq: 1,
      timestamp: entries[1].timestamp,
      actor: entries[1].actor,
      action: entries[1].action,
      detail: forgedDetail,
      outcome: entries[1].outcome,
      prevHash: entries[1].prevHash,
    });
    const forged = entries.map((e, i) => (i === 1 ? { ...e, detail: forgedDetail, hash: forgedHash } : e));
    const result = verifyIntegrity(forged);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.brokenAtSeq, 2);
  });

  it('detects a removed entry (sequence gap)', () => {
    const store = new InMemoryAuditStore();
    store.record(input('a'));
    store.record(input('b'));
    store.record(input('c'));
    const entries = store.all();
    const withGap = [entries[0], entries[2]]; // drop seq 1
    const result = verifyIntegrity(withGap);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.brokenAtSeq, 2);
  });

  it('an empty chain verifies as ok with the genesis tip', () => {
    const result = verifyIntegrity([]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.tipHash, GENESIS_PREV_HASH);
      assert.equal(result.length, 0);
    }
  });

  it('verifies a prefix without the full chain', () => {
    const store = new InMemoryAuditStore();
    store.record(input('a'));
    store.record(input('b'));
    store.record(input('c'));
    const ok = verifyPrefix(store.all(), 1);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.length, 2);
  });
});
