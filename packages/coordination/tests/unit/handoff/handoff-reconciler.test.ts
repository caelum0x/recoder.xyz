import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileHandoffs } from "../../../src/handoff/handoff-reconciler";
import type { Handoff, HandoffStatus } from "../../../src/domain";

function handoff(id: string, overrides: Partial<Handoff> = {}): Handoff {
  return {
    handoffId: id,
    intent: "delegate",
    fromAgentId: "a",
    toAgentId: "b",
    prompt: "x",
    status: "initiated" as HandoffStatus,
    depth: 0,
    rootHandoffId: id,
    initiatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-06-27T00:05:00.000Z"; // 5 minutes later
const LIVE = new Set<string>(["b"]);

test("no findings when handoffs are healthy and recent", () => {
  const findings = reconcileHandoffs({
    handoffs: [handoff("h1", { initiatedAt: NOW })],
    liveAgentIds: LIVE,
    now: NOW,
  });
  assert.equal(findings.length, 0);
});

test("orphan: a non-terminal handoff to an unknown agent is flagged", () => {
  const findings = reconcileHandoffs({
    handoffs: [handoff("h1", { toAgentId: "ghost", initiatedAt: NOW })],
    liveAgentIds: LIVE,
    now: NOW,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].driftKind, "orphan_handoff");
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].disposition, "escalate");
});

test("terminal handoffs are ignored", () => {
  const findings = reconcileHandoffs({
    handoffs: [handoff("h1", { toAgentId: "ghost", status: "completed" })],
    liveAgentIds: LIVE,
    now: NOW,
  });
  assert.equal(findings.length, 0);
});

test("stuck: a non-terminal handoff older than the threshold is flagged", () => {
  const findings = reconcileHandoffs({
    handoffs: [handoff("h1")], // initiated 5min before NOW
    liveAgentIds: LIVE,
    now: NOW,
    stuckAfterMs: 60_000,
  });
  const stuck = findings.filter((f) => f.evidence.includes("has been"));
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].severity, "medium");
});

test("duplicate: a second in-flight handoff with the same fingerprint is flagged", () => {
  const findings = reconcileHandoffs({
    handoffs: [
      handoff("h1", { initiatedAt: NOW }),
      handoff("h2", { initiatedAt: NOW }), // same from/to/intent/source
    ],
    liveAgentIds: LIVE,
    now: NOW,
  });
  const dups = findings.filter((f) => f.evidence.includes("Duplicate handoff"));
  assert.equal(dups.length, 1);
  assert.equal(dups[0].handoffId, "h2"); // earliest kept, later flagged
});

test("reconcile never throws and returns escalate-only findings", () => {
  const findings = reconcileHandoffs({
    handoffs: [handoff("h1", { toAgentId: "ghost" })],
    liveAgentIds: LIVE,
    now: NOW,
  });
  assert.ok(findings.every((f) => f.disposition === "escalate"));
});
