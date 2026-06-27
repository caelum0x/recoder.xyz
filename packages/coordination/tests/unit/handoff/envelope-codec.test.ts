import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalHandoffBytes,
  decodeEnvelope,
  deriveDedupKey,
  encodeEnvelope,
  verifyEnvelope,
} from "../../../src/handoff/envelope-codec";
import type { Handoff } from "../../../src/domain";

function handoff(overrides: Partial<Handoff> = {}): Handoff {
  return {
    handoffId: "h1",
    intent: "delegate",
    fromAgentId: "a",
    toAgentId: "b",
    prompt: "do it",
    status: "initiated",
    depth: 0,
    rootHandoffId: "h1",
    initiatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

test("dedup key is deterministic for the same handoff", () => {
  assert.equal(deriveDedupKey(handoff()), deriveDedupKey(handoff()));
});

test("dedup key differs when identity fields differ", () => {
  assert.notEqual(deriveDedupKey(handoff()), deriveDedupKey(handoff({ handoffId: "h2" })));
  assert.notEqual(deriveDedupKey(handoff()), deriveDedupKey(handoff({ toAgentId: "c" })));
});

test("encode/decode round-trips the handoff and stamps the dedup key", () => {
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "2026-06-27T00:00:01.000Z" });
  assert.equal(env.envelopeId, "e1");
  assert.equal(env.dedupKey, deriveDedupKey(handoff()));
  assert.deepEqual(decodeEnvelope(env), handoff());
});

test("an unsigned envelope verifies on dedup-key integrity", () => {
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t" });
  assert.equal(verifyEnvelope(env), true);
});

test("a tampered dedup key fails verification", () => {
  const env = { ...encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t" }), dedupKey: "forged" };
  assert.equal(verifyEnvelope(env), false);
});

test("a signed envelope verifies with the matching verifier", () => {
  const sign = (bytes: string) => `sig(${bytes})`;
  const verify = (bytes: string, sig: string) => sig === `sig(${bytes})`;
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t", sign });
  assert.equal(env.signature, `sig(${canonicalHandoffBytes(handoff())})`);
  assert.equal(verifyEnvelope(env, verify), true);
});

test("a signed envelope fails closed when no verifier is supplied", () => {
  const env = encodeEnvelope({ handoff: handoff(), envelopeId: "e1", emittedAt: "t", sign: () => "sig" });
  assert.equal(verifyEnvelope(env), false);
});
