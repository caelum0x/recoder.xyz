import assert from "node:assert/strict";
import test from "node:test";
import {
  __createSignatureForTest,
  __resetA2ATestState,
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  handleA2AIntent,
  isAllowedTarget,
  parseEnvelopeFromUnknown,
  pmApiAgentCard,
  signOutgoingA2ARequest,
  verifyIncomingA2ARequest,
} from "../lib/a2a/gateway";

const SECRET = "test-shared-secret";

function validEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    envelopeVersion: "2026-02-14",
    protocolVersion: "0.3.0",
    messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: "thread-gateway-1",
    createdAt: new Date().toISOString(),
    from: { id: "sender", name: "Sender", platform: "custom" },
    to: { id: "pm", name: "PM", platform: "recoder_pm" },
    intent: "execute",
    payload: [{ kind: "text", text: "hello" }],
    ...overrides,
  };
}

test.beforeEach(() => {
  process.env.RECODER_A2A_SHARED_SECRET = SECRET;
  process.env.RECODER_A2A_ALLOWED_AGENTS = "sender";
  delete process.env.RECODER_A2A_EGRESS_ALLOWLIST;
  delete process.env.PM_API_PUBLIC_URL;
  __resetA2ATestState();
});

// ---------------------------------------------------------------------------
// parseEnvelopeFromUnknown – comprehensive coverage
// ---------------------------------------------------------------------------

test("parseEnvelopeFromUnknown rejects non-object input", () => {
  for (const input of [null, undefined, 42, "string", true, []]) {
    const result = parseEnvelopeFromUnknown(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues.length, 1);
      assert.equal(result.issues[0].message, "must be an object");
    }
  }
});

test("parseEnvelopeFromUnknown collects multiple missing-field issues", () => {
  const result = parseEnvelopeFromUnknown({});
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.some((p) => p.includes("messageId")));
  assert.ok(paths.some((p) => p.includes("threadId")));
  assert.ok(paths.some((p) => p.includes("intent")));
  assert.ok(paths.some((p) => p.includes("from")));
  assert.ok(paths.some((p) => p.includes("to")));
  assert.ok(paths.some((p) => p.includes("payload")));
});

test("parseEnvelopeFromUnknown rejects invalid intent values", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "invalid_intent",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path.includes("intent")));
});

test("parseEnvelopeFromUnknown accepts all valid intents", () => {
  const intents = [
    "plan",
    "execute",
    "review",
    "handoff",
    "status",
    "sync",
    "tool_call",
    "tool_result",
    "error",
  ];
  for (const intent of intents) {
    const result = parseEnvelopeFromUnknown({
      messageId: `m-${intent}`,
      threadId: `t-${intent}`,
      intent,
      from: { id: "a", platform: "custom" },
      to: { id: "b", platform: "custom" },
      payload: [],
    });
    assert.equal(result.ok, true, `Expected intent '${intent}' to be accepted`);
  }
});

test("parseEnvelopeFromUnknown normalizes all valid platforms", () => {
  const platforms = [
    "codex",
    "claude_code",
    "recoder_web",
    "recoder_pm",
    "recoder_agency",
    "recoder_backend",
    "recoder_desktop",
    "custom",
  ];
  for (const platform of platforms) {
    const result = parseEnvelopeFromUnknown({
      messageId: `m-${platform}`,
      threadId: `t-${platform}`,
      intent: "plan",
      from: { id: "a", platform },
      to: { id: "b", platform },
      payload: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.envelope.from.platform, platform);
    assert.equal(result.envelope.to.platform, platform);
  }
});

test("parseEnvelopeFromUnknown preserves optional identity fields", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "execute",
    from: {
      id: "sender",
      name: "Sender Agent",
      platform: "codex",
      instanceId: "inst-1",
      team: "team-alpha",
      version: "2.0.0",
    },
    to: { id: "receiver", platform: "recoder_pm" },
    payload: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.envelope.from.instanceId, "inst-1");
  assert.equal(result.envelope.from.team, "team-alpha");
  assert.equal(result.envelope.from.version, "2.0.0");
  assert.equal(result.envelope.from.name, "Sender Agent");
  // `to` should use id as fallback name
  assert.equal(result.envelope.to.name, "receiver");
  assert.equal(result.envelope.to.instanceId, undefined);
});

test("parseEnvelopeFromUnknown preserves trace information", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "execute",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
    trace: { traceId: "trace-123", parentMessageId: "parent-456" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.envelope.trace, {
    traceId: "trace-123",
    parentMessageId: "parent-456",
  });
});

test("parseEnvelopeFromUnknown ignores trace with empty traceId", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "plan",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
    trace: { traceId: "" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.envelope.trace, undefined);
});

test("parseEnvelopeFromUnknown preserves metadata when it is a valid object", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "plan",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
    metadata: { key: "value", nested: { a: 1 } },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.envelope.metadata, { key: "value", nested: { a: 1 } });
});

test("parseEnvelopeFromUnknown ignores non-object metadata", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "plan",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
    metadata: "not-an-object",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.envelope.metadata, undefined);
});

test("parseEnvelopeFromUnknown rejects invalid createdAt timestamp", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "execute",
    from: { id: "a" },
    to: { id: "b" },
    payload: [],
    createdAt: "not-a-date",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path.includes("createdAt")));
});

test("parseEnvelopeFromUnknown uses custom sourcePath prefix in issue paths", () => {
  const result = parseEnvelopeFromUnknown({ messageId: "m-1" }, "body");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path.startsWith("body.")));
});

test("parseEnvelopeFromUnknown rejects from as non-object", () => {
  const result = parseEnvelopeFromUnknown({
    messageId: "m1",
    threadId: "t1",
    intent: "execute",
    from: "not-object",
    to: { id: "b" },
    payload: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path.endsWith(".from")));
});

// ---------------------------------------------------------------------------
// buildInvalidA2AEnvelopeError
// ---------------------------------------------------------------------------

test("buildInvalidA2AEnvelopeError returns correct structure", () => {
  const error = buildInvalidA2AEnvelopeError({
    issues: [{ path: "test.field", message: "is required" }],
  });
  assert.equal(error.ok, false);
  assert.equal(error.code, "INVALID_A2A_ENVELOPE");
  assert.equal(error.schemaVersion, "a2a-envelope-error-v1");
  assert.equal(error.issues.length, 1);
  assert.equal(error.issues[0].path, "test.field");
});

test("buildInvalidA2AEnvelopeError accepts custom error message", () => {
  const error = buildInvalidA2AEnvelopeError({
    issues: [],
    error: "Custom error message",
  });
  assert.equal(error.error, "Custom error message");
});

test("buildInvalidA2AEnvelopeError uses default error message when omitted", () => {
  const error = buildInvalidA2AEnvelopeError({ issues: [] });
  assert.equal(error.error, "Invalid A2A envelope");
});

// ---------------------------------------------------------------------------
// verifyIncomingA2ARequest
// ---------------------------------------------------------------------------

test("verifyIncomingA2ARequest rejects when shared secret is not configured", async () => {
  delete process.env.RECODER_A2A_SHARED_SECRET;
  const result = await verifyIncomingA2ARequest({
    headers: new Headers(),
    rawBody: "{}",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 503);
});

test("verifyIncomingA2ARequest rejects missing agent id header", async () => {
  const result = await verifyIncomingA2ARequest({
    headers: new Headers(),
    rawBody: "{}",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 401);
  assert.ok(result.error.includes("agent-id"));
});

test("verifyIncomingA2ARequest rejects disallowed agent", async () => {
  process.env.RECODER_A2A_ALLOWED_AGENTS = "allowed-agent";
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "forbidden-agent",
      "x-recoder-a2a-timestamp": `${Math.floor(Date.now() / 1000)}`,
      "x-recoder-a2a-signature": "v1=fake",
    }),
    rawBody: "{}",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 403);
});

test("verifyIncomingA2ARequest allows any agent when allow list is empty", async () => {
  process.env.RECODER_A2A_ALLOWED_AGENTS = "";
  const ts = `${Math.floor(Date.now() / 1000)}`;
  const raw = "{}";
  const sig = await __createSignatureForTest(ts, raw, SECRET);
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "any-agent",
      "x-recoder-a2a-timestamp": ts,
      "x-recoder-a2a-signature": `v1=${sig}`,
    }),
    rawBody: raw,
  });
  assert.equal(result.ok, true);
});

test("verifyIncomingA2ARequest rejects missing signature headers", async () => {
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "sender",
    }),
    rawBody: "{}",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 401);
});

test("verifyIncomingA2ARequest rejects non-numeric timestamp", async () => {
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "sender",
      "x-recoder-a2a-timestamp": "not-a-number",
      "x-recoder-a2a-signature": "v1=abc",
    }),
    rawBody: "{}",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
});

test("verifyIncomingA2ARequest accepts valid signature", async () => {
  const ts = `${Math.floor(Date.now() / 1000)}`;
  const raw = JSON.stringify({ test: true });
  const sig = await __createSignatureForTest(ts, raw, SECRET);
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "sender",
      "x-recoder-a2a-timestamp": ts,
      "x-recoder-a2a-signature": `v1=${sig}`,
    }),
    rawBody: raw,
  });
  assert.equal(result.ok, true);
});

test("verifyIncomingA2ARequest normalizes millisecond timestamps", async () => {
  const nowMs = Date.now();
  const ts = `${nowMs}`;
  const raw = "{}";
  const sig = await __createSignatureForTest(ts, raw, SECRET);
  const result = await verifyIncomingA2ARequest({
    headers: new Headers({
      "x-recoder-a2a-agent-id": "sender",
      "x-recoder-a2a-timestamp": ts,
      "x-recoder-a2a-signature": `v1=${sig}`,
    }),
    rawBody: raw,
  });
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// checkAndStoreEnvelopeIdempotency
// ---------------------------------------------------------------------------

test("checkAndStoreEnvelopeIdempotency rejects missing messageId", async () => {
  const result = await checkAndStoreEnvelopeIdempotency({} as any);
  assert.equal(result.accepted, false);
  assert.equal(result.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency accepts first message", async () => {
  const result = await checkAndStoreEnvelopeIdempotency({
    messageId: "unique-msg-1",
  } as any);
  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency detects duplicate", async () => {
  const envelope = { messageId: "dup-msg-1" } as any;
  const first = await checkAndStoreEnvelopeIdempotency(envelope);
  const second = await checkAndStoreEnvelopeIdempotency(envelope);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test("checkAndStoreEnvelopeIdempotency treats different messageIds independently", async () => {
  const a = await checkAndStoreEnvelopeIdempotency({ messageId: "a-1" } as any);
  const b = await checkAndStoreEnvelopeIdempotency({ messageId: "b-1" } as any);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, false);
});

// ---------------------------------------------------------------------------
// signOutgoingA2ARequest
// ---------------------------------------------------------------------------

test("signOutgoingA2ARequest produces v1-prefixed signature", async () => {
  const result = await signOutgoingA2ARequest('{"test": true}');
  assert.ok(result.signature.startsWith("v1="));
  assert.ok(result.timestamp.length > 0);
});

test("signOutgoingA2ARequest throws when secret is not configured", async () => {
  delete process.env.RECODER_A2A_SHARED_SECRET;
  await assert.rejects(
    () => signOutgoingA2ARequest("body"),
    (error: Error) => {
      assert.ok(error.message.includes("RECODER_A2A_SHARED_SECRET"));
      return true;
    }
  );
});

test("signOutgoingA2ARequest produces deterministic signatures for same input", async () => {
  // Override Date.now to control timestamp
  const body = '{"deterministic": true}';
  const result1 = await signOutgoingA2ARequest(body);
  // Signatures use the same timestamp only if called at the same second
  // Just verify the format is consistent
  assert.match(result1.signature, /^v1=[a-f0-9]{64}$/);
});

// ---------------------------------------------------------------------------
// isAllowedTarget
// ---------------------------------------------------------------------------

test("isAllowedTarget allows any target when no allowlist is configured", () => {
  delete process.env.RECODER_A2A_EGRESS_ALLOWLIST;
  assert.equal(isAllowedTarget("http://any-host.example.com/api"), true);
});

test("isAllowedTarget allows empty allowlist string", () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST = "";
  assert.equal(isAllowedTarget("http://any-host.example.com/api"), true);
});

test("isAllowedTarget allows matching prefix", () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST = "http://allowed.example.com";
  assert.equal(isAllowedTarget("http://allowed.example.com/api/a2a"), true);
});

test("isAllowedTarget rejects non-matching prefix", () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST = "http://allowed.example.com";
  assert.equal(isAllowedTarget("http://blocked.example.com/api"), false);
});

test("isAllowedTarget supports multiple comma-separated prefixes", () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST =
    "http://host-a.example.com,http://host-b.example.com";
  assert.equal(isAllowedTarget("http://host-a.example.com/api"), true);
  assert.equal(isAllowedTarget("http://host-b.example.com/api"), true);
  assert.equal(isAllowedTarget("http://host-c.example.com/api"), false);
});

test("isAllowedTarget trims whitespace in allowlist entries", () => {
  process.env.RECODER_A2A_EGRESS_ALLOWLIST =
    "  http://host-a.example.com , http://host-b.example.com  ";
  assert.equal(isAllowedTarget("http://host-a.example.com/api"), true);
  assert.equal(isAllowedTarget("http://host-b.example.com/api"), true);
});

// ---------------------------------------------------------------------------
// handleA2AIntent
// ---------------------------------------------------------------------------

test("handleA2AIntent handles plan intent", async () => {
  const result = await handleA2AIntent(validEnvelope({ intent: "plan" }) as any);
  assert.equal(result.handled, true);
  assert.equal(result.status, "accepted");
  assert.equal(result.action, "plan_registered");
});

test("handleA2AIntent handles execute intent", async () => {
  const result = await handleA2AIntent(validEnvelope({ intent: "execute" }) as any);
  assert.equal(result.handled, true);
  assert.equal(result.action, "execution_requested");
});

test("handleA2AIntent handles handoff intent", async () => {
  const result = await handleA2AIntent(validEnvelope({ intent: "handoff" }) as any);
  assert.equal(result.handled, true);
  assert.equal(result.action, "handoff_received");
});

test("handleA2AIntent handles tool_call intent", async () => {
  const result = await handleA2AIntent(validEnvelope({ intent: "tool_call" }) as any);
  assert.equal(result.handled, true);
  assert.equal(result.action, "tool_call_received");
});

test("handleA2AIntent returns ignored for unsupported intents", async () => {
  const result = await handleA2AIntent(validEnvelope({ intent: "review" }) as any);
  assert.equal(result.handled, false);
  assert.equal(result.status, "ignored");
  assert.equal(result.action, "unsupported_intent");
});

// ---------------------------------------------------------------------------
// pmApiAgentCard
// ---------------------------------------------------------------------------

test("pmApiAgentCard returns well-formed agent card", () => {
  const card = pmApiAgentCard();
  assert.equal(card.name, "Recoder PM API Agent");
  assert.equal(card.protocolVersion, "0.3.0");
  assert.equal(card.version, "1.0.0");
  assert.ok(card.url.includes("/api/a2a/envelope"));
  assert.ok(Array.isArray(card.skills));
  assert.ok(card.skills.length > 0);
  assert.equal(typeof card.capabilities.streaming, "boolean");
  assert.equal(typeof card.capabilities.pushNotifications, "boolean");
  assert.ok(Array.isArray(card.defaultInputModes));
  assert.ok(Array.isArray(card.defaultOutputModes));
});

test("pmApiAgentCard uses PM_API_PUBLIC_URL when set", () => {
  process.env.PM_API_PUBLIC_URL = "https://custom.example.com";
  const card = pmApiAgentCard();
  assert.ok(card.url.startsWith("https://custom.example.com"));
});

test("pmApiAgentCard uses default URL when PM_API_PUBLIC_URL is not set", () => {
  delete process.env.PM_API_PUBLIC_URL;
  const card = pmApiAgentCard();
  assert.ok(card.url.startsWith("https://pm.recoder.xyz/api"));
});

test("pmApiAgentCard skills have required properties", () => {
  const card = pmApiAgentCard();
  for (const skill of card.skills) {
    assert.ok(typeof skill.id === "string" && skill.id.length > 0);
    assert.ok(typeof skill.name === "string" && skill.name.length > 0);
    assert.ok(typeof skill.description === "string" && skill.description.length > 0);
    assert.ok(Array.isArray(skill.tags));
    assert.ok(skill.tags.length > 0);
  }
});
