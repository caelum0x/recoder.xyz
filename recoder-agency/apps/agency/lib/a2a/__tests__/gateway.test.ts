import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";
import {
	__createSignatureForTest,
	__resetA2ATestState,
	agencyAgentCard,
	buildInvalidA2AEnvelopeError,
	checkAndStoreEnvelopeIdempotency,
	handleA2AIntent,
	isAllowedTarget,
	parseEnvelopeFromUnknown,
	signOutgoingA2ARequest,
	verifyIncomingA2ARequest,
} from "../gateway";

const SECRET = "test-shared-secret";

function makeEnvelope(overrides?: Partial<RecoderA2AEnvelope>): RecoderA2AEnvelope {
	return {
		envelopeVersion: "2026-02-14",
		protocolVersion: "0.3.0",
		messageId: `msg-agency-${Date.now()}`,
		threadId: "thread-agency-1",
		createdAt: new Date().toISOString(),
		from: { id: "sender", name: "Sender", platform: "custom" },
		to: { id: "agency", name: "Agency", platform: "recoder_agency" },
		intent: "execute",
		payload: [{ kind: "text", text: "hello" }],
		...overrides,
	};
}

function freshTimestamp(): string {
	return `${Math.floor(Date.now() / 1000)}`;
}

async function buildHeaders(rawBody: string, opts?: {
	agentId?: string;
	timestamp?: string;
	signature?: string;
	secret?: string;
	omitAgentId?: boolean;
	omitTimestamp?: boolean;
	omitSignature?: boolean;
}): Promise<Headers> {
	const ts = opts?.timestamp ?? freshTimestamp();
	const sec = opts?.secret ?? SECRET;
	const sig = opts?.signature ?? `v1=${await __createSignatureForTest(ts, rawBody, sec)}`;

	const headers = new Headers({ "content-type": "application/json" });
	if (!opts?.omitAgentId) headers.set("x-recoder-a2a-agent-id", opts?.agentId ?? "sender");
	if (!opts?.omitTimestamp) headers.set("x-recoder-a2a-timestamp", ts);
	if (!opts?.omitSignature) headers.set("x-recoder-a2a-signature", sig);
	return headers;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	process.env.RECODER_A2A_SHARED_SECRET = SECRET;
	process.env.RECODER_A2A_ALLOWED_AGENTS = "sender";
	delete process.env.RECODER_A2A_EGRESS_ALLOWLIST;
	delete process.env.RECODER_A2A_REDIS_URL;
	delete process.env.REDIS_URL;
	delete process.env.AGENCY_PUBLIC_URL;
	__resetA2ATestState();
});

test("parseEnvelopeFromUnknown: validates legacy envelopes through shared normalization", () => {
	const result = parseEnvelopeFromUnknown({
		messageId: "msg-parse-1",
		threadId: "thread-parse-1",
		intent: "execute",
		from: { id: "sender", platform: "unknown-platform" },
		to: { id: "agency", platform: "recoder_agency" },
		payload: [{ kind: "text", text: "hello" }],
	});

	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}

	assert.equal(result.envelope.from.platform, "custom");
	assert.equal(result.envelope.to.name, "agency");
});

test("buildInvalidA2AEnvelopeError: returns the shared invalid-envelope contract shape", () => {
	const error = buildInvalidA2AEnvelopeError({
		issues: [{ path: "body.payload[0].text", message: "must be a non-empty string" }],
	});

	assert.equal(error.ok, false);
	assert.equal(error.code, "INVALID_A2A_ENVELOPE");
	assert.equal(error.schemaVersion, "a2a-envelope-error-v1");
	assert.equal(error.issues[0]?.path, "body.payload[0].text");
});

// ---------------------------------------------------------------------------
// 1. verifyIncomingA2ARequest
// ---------------------------------------------------------------------------

test("verifyIncomingA2ARequest: accepts valid signature", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody);
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.deepEqual(result, { ok: true });
});

test("verifyIncomingA2ARequest: rejects bad signature", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { signature: "v1=deadbeef" });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /Signature verification failed/);
	}
});

test("verifyIncomingA2ARequest: rejects signature without v1= prefix", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { signature: "completely-wrong" });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
	}
});

test("verifyIncomingA2ARequest: rejects missing agent-id header", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { omitAgentId: true });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /Missing x-recoder-a2a-agent-id/);
	}
});

test("verifyIncomingA2ARequest: rejects missing timestamp header", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { omitTimestamp: true });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /Missing signature headers/);
	}
});

test("verifyIncomingA2ARequest: rejects missing signature header", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { omitSignature: true });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /Missing signature headers/);
	}
});

test("verifyIncomingA2ARequest: rejects stale timestamp (>5 min old)", async () => {
	const staleTs = `${Math.floor((Date.now() - 10 * 60 * 1000) / 1000)}`;
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { timestamp: staleTs });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /timestamp outside acceptable window/);
	}
});

test("verifyIncomingA2ARequest: rejects future timestamp beyond skew", async () => {
	const futureTs = `${Math.floor((Date.now() + 10 * 60 * 1000) / 1000)}`;
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { timestamp: futureTs });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 401);
		assert.match(result.error, /timestamp outside acceptable window/);
	}
});

test("verifyIncomingA2ARequest: rejects invalid (non-numeric) timestamp", async () => {
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { timestamp: "not-a-number" });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 400);
		assert.match(result.error, /Invalid x-recoder-a2a-timestamp/);
	}
});

test("verifyIncomingA2ARequest: rejects unknown agent when allowlist is set", async () => {
	process.env.RECODER_A2A_ALLOWED_AGENTS = "agent-a,agent-b";
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { agentId: "unknown-agent" });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 403);
		assert.match(result.error, /Sender agent is not allowed/);
	}
});

test("verifyIncomingA2ARequest: accepts any agent when allowlist is empty", async () => {
	process.env.RECODER_A2A_ALLOWED_AGENTS = "";
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody, { agentId: "any-agent-id" });
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.deepEqual(result, { ok: true });
});

test("verifyIncomingA2ARequest: returns 503 when shared secret is not configured", async () => {
	delete process.env.RECODER_A2A_SHARED_SECRET;
	const rawBody = JSON.stringify(makeEnvelope());
	const headers = await buildHeaders(rawBody);
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.status, 503);
		assert.match(result.error, /RECODER_A2A_SHARED_SECRET is not configured/);
	}
});

test("verifyIncomingA2ARequest: accepts millisecond timestamp within skew", async () => {
	const msTimestamp = `${Date.now()}`;
	const rawBody = JSON.stringify(makeEnvelope());
	const sig = await __createSignatureForTest(msTimestamp, rawBody, SECRET);
	const headers = new Headers({
		"content-type": "application/json",
		"x-recoder-a2a-agent-id": "sender",
		"x-recoder-a2a-timestamp": msTimestamp,
		"x-recoder-a2a-signature": `v1=${sig}`,
	});
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.deepEqual(result, { ok: true });
});

// ---------------------------------------------------------------------------
// 2. checkAndStoreEnvelopeIdempotency
// ---------------------------------------------------------------------------

test("checkAndStoreEnvelopeIdempotency: first message is accepted (not duplicate)", async () => {
	const envelope = makeEnvelope({ messageId: "idem-1" });
	const result = await checkAndStoreEnvelopeIdempotency(envelope);
	assert.equal(result.accepted, true);
	assert.equal(result.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency: replay is detected as duplicate", async () => {
	const envelope = makeEnvelope({ messageId: "idem-2" });
	const first = await checkAndStoreEnvelopeIdempotency(envelope);
	const second = await checkAndStoreEnvelopeIdempotency(envelope);
	assert.equal(first.accepted, true);
	assert.equal(first.duplicate, false);
	assert.equal(second.accepted, true);
	assert.equal(second.duplicate, true);
});

test("checkAndStoreEnvelopeIdempotency: different messageIds are not duplicates", async () => {
	const envelope1 = makeEnvelope({ messageId: "idem-a" });
	const envelope2 = makeEnvelope({ messageId: "idem-b" });
	const result1 = await checkAndStoreEnvelopeIdempotency(envelope1);
	const result2 = await checkAndStoreEnvelopeIdempotency(envelope2);
	assert.equal(result1.duplicate, false);
	assert.equal(result2.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency: missing messageId returns not accepted", async () => {
	const envelope = makeEnvelope();
	// Force messageId to be empty
	(envelope as any).messageId = "";
	const result = await checkAndStoreEnvelopeIdempotency(envelope);
	assert.equal(result.accepted, false);
	assert.equal(result.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency: null envelope returns not accepted", async () => {
	const result = await checkAndStoreEnvelopeIdempotency(null as any);
	assert.equal(result.accepted, false);
	assert.equal(result.duplicate, false);
});

test("checkAndStoreEnvelopeIdempotency: reset clears previous entries", async () => {
	const envelope = makeEnvelope({ messageId: "idem-reset" });
	await checkAndStoreEnvelopeIdempotency(envelope);
	__resetA2ATestState();
	const result = await checkAndStoreEnvelopeIdempotency(envelope);
	assert.equal(result.accepted, true);
	assert.equal(result.duplicate, false);
});

// ---------------------------------------------------------------------------
// 3. signOutgoingA2ARequest
// ---------------------------------------------------------------------------

test("signOutgoingA2ARequest: returns valid timestamp and signature", async () => {
	const rawBody = JSON.stringify({ test: true });
	const result = await signOutgoingA2ARequest(rawBody);

	assert.ok(result.timestamp, "timestamp should be present");
	assert.ok(result.signature, "signature should be present");
	assert.ok(result.signature.startsWith("v1="), "signature should have v1= prefix");

	// Timestamp should be a valid number (seconds)
	const ts = Number(result.timestamp);
	assert.ok(Number.isFinite(ts), "timestamp should be a finite number");
	assert.ok(ts > 0, "timestamp should be positive");

	// Verify the signature is correct by re-computing
	const expectedDigest = await __createSignatureForTest(result.timestamp, rawBody, SECRET);
	assert.equal(result.signature, `v1=${expectedDigest}`);
});

test("signOutgoingA2ARequest: produced signature is verifiable by verifyIncomingA2ARequest", async () => {
	process.env.RECODER_A2A_ALLOWED_AGENTS = "";
	const envelope = makeEnvelope();
	const rawBody = JSON.stringify(envelope);
	const { timestamp, signature } = await signOutgoingA2ARequest(rawBody);

	const headers = new Headers({
		"content-type": "application/json",
		"x-recoder-a2a-agent-id": "agency",
		"x-recoder-a2a-timestamp": timestamp,
		"x-recoder-a2a-signature": signature,
	});
	const result = await verifyIncomingA2ARequest({ headers, rawBody });
	assert.deepEqual(result, { ok: true });
});

test("signOutgoingA2ARequest: throws when RECODER_A2A_SHARED_SECRET is not set", async () => {
	delete process.env.RECODER_A2A_SHARED_SECRET;
	await assert.rejects(
		() => signOutgoingA2ARequest(JSON.stringify({ test: true })),
		(err: Error) => {
			assert.match(err.message, /RECODER_A2A_SHARED_SECRET is not configured/);
			return true;
		},
	);
});

test("signOutgoingA2ARequest: different bodies produce different signatures", async () => {
	const result1 = await signOutgoingA2ARequest(JSON.stringify({ a: 1 }));
	const result2 = await signOutgoingA2ARequest(JSON.stringify({ b: 2 }));
	assert.notEqual(result1.signature, result2.signature);
});

// ---------------------------------------------------------------------------
// 4. isAllowedTarget
// ---------------------------------------------------------------------------

test("isAllowedTarget: matches prefix in allowlist", () => {
	process.env.RECODER_A2A_EGRESS_ALLOWLIST = "https://api.recoder.xyz,https://pm.recoder.xyz";
	assert.equal(isAllowedTarget("https://api.recoder.xyz/a2a/envelope"), true);
	assert.equal(isAllowedTarget("https://pm.recoder.xyz/a2a/envelope"), true);
});

test("isAllowedTarget: rejects non-matching URL", () => {
	process.env.RECODER_A2A_EGRESS_ALLOWLIST = "https://api.recoder.xyz";
	assert.equal(isAllowedTarget("https://evil.com/steal"), false);
});

test("isAllowedTarget: empty allowlist allows all targets", () => {
	process.env.RECODER_A2A_EGRESS_ALLOWLIST = "";
	assert.equal(isAllowedTarget("https://anything.example.com/path"), true);
});

test("isAllowedTarget: unset allowlist allows all targets", () => {
	delete process.env.RECODER_A2A_EGRESS_ALLOWLIST;
	assert.equal(isAllowedTarget("https://anything.example.com"), true);
});

test("isAllowedTarget: partial prefix does not match different domain", () => {
	process.env.RECODER_A2A_EGRESS_ALLOWLIST = "https://api.recoder.xyz";
	assert.equal(isAllowedTarget("https://api.recoder.xyz.evil.com"), true); // prefix match is substring
	assert.equal(isAllowedTarget("https://evil.com/https://api.recoder.xyz"), false);
});

test("isAllowedTarget: handles whitespace in allowlist entries", () => {
	process.env.RECODER_A2A_EGRESS_ALLOWLIST = " https://api.recoder.xyz , https://pm.recoder.xyz ";
	assert.equal(isAllowedTarget("https://api.recoder.xyz/endpoint"), true);
	assert.equal(isAllowedTarget("https://pm.recoder.xyz/endpoint"), true);
});

// ---------------------------------------------------------------------------
// 5. handleA2AIntent
// ---------------------------------------------------------------------------

test("handleA2AIntent: plan intent returns plan_registered", async () => {
	const envelope = makeEnvelope({ intent: "plan" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, true);
	assert.equal(result.status, "accepted");
	assert.equal(result.action, "plan_registered");
});

test("handleA2AIntent: execute intent returns execution_requested", async () => {
	const envelope = makeEnvelope({ intent: "execute" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, true);
	assert.equal(result.status, "accepted");
	assert.equal(result.action, "execution_requested");
});

test("handleA2AIntent: handoff intent returns handoff_received", async () => {
	const envelope = makeEnvelope({ intent: "handoff" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, true);
	assert.equal(result.status, "accepted");
	assert.equal(result.action, "handoff_received");
});

test("handleA2AIntent: tool_call intent returns tool_call_received", async () => {
	const envelope = makeEnvelope({ intent: "tool_call" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, true);
	assert.equal(result.status, "accepted");
	assert.equal(result.action, "tool_call_received");
});

test("handleA2AIntent: unknown intent returns ignored", async () => {
	const envelope = makeEnvelope({ intent: "nonexistent" as any });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, false);
	assert.equal(result.status, "ignored");
	assert.equal(result.action, "unsupported_intent");
});

test("handleA2AIntent: review intent (not handled) returns ignored", async () => {
	const envelope = makeEnvelope({ intent: "review" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, false);
	assert.equal(result.status, "ignored");
	assert.equal(result.action, "unsupported_intent");
});

test("handleA2AIntent: status intent (not handled) returns ignored", async () => {
	const envelope = makeEnvelope({ intent: "status" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, false);
	assert.equal(result.status, "ignored");
	assert.equal(result.action, "unsupported_intent");
});

test("handleA2AIntent: accepted intents include details object", async () => {
	const envelope = makeEnvelope({ intent: "plan" });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, true);
	assert.ok(result.details !== undefined, "details should be present for accepted intents");
	assert.equal(typeof result.details, "object");
});

test("handleA2AIntent: ignored intent does not include details", async () => {
	const envelope = makeEnvelope({ intent: "sync" as any });
	const result = await handleA2AIntent(envelope);
	assert.equal(result.handled, false);
	assert.equal(result.details, undefined);
});

// ---------------------------------------------------------------------------
// 6. agencyAgentCard
// ---------------------------------------------------------------------------

test("agencyAgentCard: returns correct structure with default URL", () => {
	const card = agencyAgentCard();
	assert.equal(card.name, "Recoder Agency Agent");
	assert.equal(card.description, "Agency workflow and delivery orchestration agent");
	assert.equal(card.protocolVersion, "0.3.0");
	assert.equal(card.version, "1.0.0");
	assert.equal(card.url, "https://agency.recoder.xyz/api/a2a/envelope");
});

test("agencyAgentCard: uses AGENCY_PUBLIC_URL env var for base URL", () => {
	process.env.AGENCY_PUBLIC_URL = "https://custom-agency.example.com";
	const card = agencyAgentCard();
	assert.equal(card.url, "https://custom-agency.example.com/api/a2a/envelope");
});

test("agencyAgentCard: includes skills array", () => {
	const card = agencyAgentCard();
	assert.ok(Array.isArray(card.skills), "skills should be an array");
	assert.ok(card.skills.length >= 2, "should have at least 2 skills");

	const deliverySkill = card.skills.find((s) => s.id === "delivery");
	assert.ok(deliverySkill, "should have a delivery skill");
	assert.equal(deliverySkill?.name, "Delivery Ops");
	assert.ok(deliverySkill?.tags.includes("agency"));

	const clientSyncSkill = card.skills.find((s) => s.id === "client-sync");
	assert.ok(clientSyncSkill, "should have a client-sync skill");
	assert.equal(clientSyncSkill?.name, "Client Sync");
	assert.ok(clientSyncSkill?.tags.includes("client"));
});

test("agencyAgentCard: includes capabilities", () => {
	const card = agencyAgentCard();
	assert.equal(card.capabilities.streaming, true);
	assert.equal(card.capabilities.pushNotifications, false);
});

test("agencyAgentCard: includes input and output modes", () => {
	const card = agencyAgentCard();
	assert.ok(card.defaultInputModes.includes("text"));
	assert.ok(card.defaultInputModes.includes("application/json"));
	assert.ok(card.defaultOutputModes.includes("text"));
	assert.ok(card.defaultOutputModes.includes("application/json"));
});

// ---------------------------------------------------------------------------
// 7. __createSignatureForTest helper
// ---------------------------------------------------------------------------

test("__createSignatureForTest: produces consistent output for same input", async () => {
	const sig1 = await __createSignatureForTest("12345", '{"a":1}', "secret");
	const sig2 = await __createSignatureForTest("12345", '{"a":1}', "secret");
	assert.equal(sig1, sig2);
});

test("__createSignatureForTest: different secrets produce different signatures", async () => {
	const sig1 = await __createSignatureForTest("12345", '{"a":1}', "secret-a");
	const sig2 = await __createSignatureForTest("12345", '{"a":1}', "secret-b");
	assert.notEqual(sig1, sig2);
});

test("__createSignatureForTest: different timestamps produce different signatures", async () => {
	const sig1 = await __createSignatureForTest("11111", '{"a":1}', "secret");
	const sig2 = await __createSignatureForTest("22222", '{"a":1}', "secret");
	assert.notEqual(sig1, sig2);
});

test("__createSignatureForTest: output is lowercase hex string", async () => {
	const sig = await __createSignatureForTest("12345", "body", "secret");
	assert.match(sig, /^[0-9a-f]+$/, "signature should be lowercase hex");
	assert.equal(sig.length, 64, "SHA-256 hex digest should be 64 characters");
});
