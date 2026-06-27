import { test } from "node:test";
import assert from "node:assert/strict";
import { DedupLedger, decideDedup } from "../../../src/handoff/dedup-ledger";

test("an empty ledger has not seen any key", () => {
  const ledger = DedupLedger.empty();
  assert.equal(ledger.has("k1"), false);
  assert.equal(ledger.size, 0);
});

test("remember is immutable and records the key", () => {
  const empty = DedupLedger.empty();
  const next = empty.remember("k1");
  assert.equal(empty.has("k1"), false);
  assert.equal(next.has("k1"), true);
});

test("remembering the same key twice returns the same ledger", () => {
  const a = DedupLedger.empty().remember("k1");
  const b = a.remember("k1");
  assert.equal(a, b);
});

test("decideDedup accepts a new key and yields the next ledger", () => {
  const decision = decideDedup(DedupLedger.empty(), "k1");
  assert.equal(decision.duplicate, false);
  if (!decision.duplicate) {
    assert.equal(decision.ledger.has("k1"), true);
  }
});

test("decideDedup drops a duplicate key (effectively-once)", () => {
  const ledger = DedupLedger.empty().remember("k1");
  const decision = decideDedup(ledger, "k1");
  assert.equal(decision.duplicate, true);
});

test("the ledger is bounded by its cap (oldest trimmed)", () => {
  let ledger = DedupLedger.empty(2);
  ledger = ledger.remember("a").remember("b").remember("c");
  assert.equal(ledger.size, 2);
  assert.equal(ledger.has("a"), false); // oldest trimmed
  assert.equal(ledger.has("c"), true);
});

test("from() rehydrates previously-seen keys", () => {
  const ledger = DedupLedger.from(["x", "y"]);
  assert.equal(ledger.has("x"), true);
  assert.equal(ledger.has("y"), true);
});
