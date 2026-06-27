import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandoffIntent } from "../../../src/handoff/handoff-parser";

test("returns null when no agents are mentioned", () => {
  assert.equal(parseHandoffIntent("handoff: do the thing", []), null);
});

test("parses a handoff: prefix into the handoff intent", () => {
  const parsed = parseHandoffIntent("@bob handoff: finish the API", ["bob"]);
  assert.deepEqual(parsed, {
    intent: "handoff",
    targetAgentId: "bob",
    prompt: "finish the API",
  });
});

test("parses delegate:, review: and merge: prefixes", () => {
  assert.equal(parseHandoffIntent("@bob delegate: x", ["bob"])?.intent, "delegate");
  assert.equal(parseHandoffIntent("@bob review: x", ["bob"])?.intent, "review");
  assert.equal(parseHandoffIntent("@bob merge: x", ["bob"])?.intent, "merge");
});

test("intent prefix matching is case-insensitive", () => {
  const parsed = parseHandoffIntent("@bob HANDOFF: ship it", ["bob"]);
  assert.equal(parsed?.intent, "handoff");
  assert.equal(parsed?.prompt, "ship it");
});

test("a mention with no intent prefix is not a handoff (null)", () => {
  // Source returned a 'message' sentinel; coordination has no message intent.
  assert.equal(parseHandoffIntent("@bob can you look at this?", ["bob"]), null);
});

test("uses the first mentioned agent as the target", () => {
  const parsed = parseHandoffIntent("@bob delegate: x", ["bob", "carol"]);
  assert.equal(parsed?.targetAgentId, "bob");
});

test("strips the @mention before reading the prefix", () => {
  const parsed = parseHandoffIntent("@bob   handoff:   trimmed  ", ["bob"]);
  assert.equal(parsed?.prompt, "trimmed");
});

test("agent ids with regex metacharacters are matched literally", () => {
  const parsed = parseHandoffIntent("@agent.v1 handoff: ok", ["agent.v1"]);
  assert.equal(parsed?.intent, "handoff");
  assert.equal(parsed?.prompt, "ok");
});
