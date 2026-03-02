import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvelopeFromUnknown } from "../lib/a2a/gateway";

test("parseEnvelopeFromUnknown applies defaults and normalizes unknown platforms", () => {
  const parsed = parseEnvelopeFromUnknown({
    messageId: "msg-parse-1",
    threadId: "thread-parse-1",
    intent: "execute",
    from: { id: "agent-a", platform: "unknown-platform" },
    to: { id: "agent-b", platform: "also-unknown" },
    payload: [],
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.envelope.envelopeVersion, "2026-02-14");
  assert.equal(parsed.envelope.protocolVersion, "0.3.0");
  assert.equal(parsed.envelope.from.platform, "custom");
  assert.equal(parsed.envelope.to.platform, "custom");
  assert.equal(parsed.envelope.from.name, "agent-a");
  assert.equal(parsed.envelope.to.name, "agent-b");
  assert.match(parsed.envelope.createdAt, /\d{4}-\d{2}-\d{2}T/);
});

test("parseEnvelopeFromUnknown validates payload shape", () => {
  const parsed = parseEnvelopeFromUnknown({
    messageId: "msg-parse-2",
    threadId: "thread-parse-2",
    intent: "plan",
    from: { id: "agent-a", platform: "custom" },
    to: { id: "agent-b", platform: "custom" },
    payload: "invalid",
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.issues.some((issue) => issue.path.endsWith(".payload")), true);
});
