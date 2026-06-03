import {
	normalizeLegacyInboundEnvelope,
	type LegacyInboundEnvelope,
	type ValidationIssue,
} from "@recoder/a2a-sdk";
import type { RecoderA2AEnvelope } from "@recoder/shared/a2a";

const MAX_CLOCK_SKEW_MS = Number(process.env.RECODER_A2A_MAX_SKEW_MS || 5 * 60 * 1000);
const IDEMPOTENCY_TTL_MS = Number(process.env.RECODER_A2A_IDEMPOTENCY_TTL_MS || 10 * 60 * 1000);
const IDEMPOTENCY_KEY_PREFIX = process.env.RECODER_A2A_IDEMPOTENCY_KEY_PREFIX || "recoder:a2a:idempotency";
const INTENT_STREAM_KEY = process.env.RECODER_A2A_INTENT_STREAM_KEY || "recoder:a2a:intents";

type RedisLike = {
	connect: () => Promise<void>;
	set: (...args: any[]) => Promise<any>;
	xadd: (...args: any[]) => Promise<any>;
};

const idempotencyStore = new Map<string, number>();
let redisClient: RedisLike | null = null;
let redisLoadAttempted = false;

const A2A_ENVELOPE_ERROR_SCHEMA_VERSION = "a2a-envelope-error-v1";
const INVALID_A2A_ENVELOPE_CODE = "INVALID_A2A_ENVELOPE";

function getRedisUrl(): string {
	return process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || "";
}

async function getRedisClient(): Promise<RedisLike | null> {
	const url = getRedisUrl();
	if (!url) return null;

	if (redisClient) return redisClient;
	if (redisLoadAttempted) return null;
	redisLoadAttempted = true;

	try {
		const moduleName = process.env.RECODER_A2A_REDIS_MODULE || "ioredis";
		const mod = await import(/* @vite-ignore */ moduleName);
		const RedisCtor = (mod as any).default;
		const client = new RedisCtor(url, {
			maxRetriesPerRequest: 2,
			enableReadyCheck: true,
			lazyConnect: true,
		}) as RedisLike;
		await client.connect();
		redisClient = client;
		return redisClient;
	} catch {
		redisClient = null;
		return null;
	}
}

function parseAllowedAgents(): Set<string> {
	return new Set(
		(process.env.RECODER_A2A_ALLOWED_AGENTS || "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
}

function normalizeSignature(value: string): string {
	return value.startsWith("v1=") ? value.slice(3) : value;
}

function normalizeTimestampMs(value: string): number {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return Number.NaN;
	return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function secureEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

async function hmacHex(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function cleanIdempotencyStore(nowMs: number): void {
	for (const [messageId, expiresAt] of idempotencyStore.entries()) {
		if (expiresAt <= nowMs) idempotencyStore.delete(messageId);
	}
}

function resolveIngressWorkspaceId(): string {
	return process.env.RECODER_AGENCY_A2A_WORKSPACE_ID?.trim() || "recoder-agency";
}

export function parseEnvelopeFromUnknown(
	value: unknown,
	sourcePath = "envelope",
): { ok: true; envelope: RecoderA2AEnvelope } | { ok: false; issues: ValidationIssue[] } {
	if (typeof value === "string") {
		return { ok: false, issues: [{ path: sourcePath, message: "must be an object" }] };
	}

	const normalized = normalizeLegacyInboundEnvelope(value, {
		workspaceId: resolveIngressWorkspaceId(),
		sourcePath,
	});
	if (!normalized.ok) {
		return { ok: false, issues: normalized.issues };
	}

	return {
		ok: true,
		envelope: normalized.legacyEnvelope as LegacyInboundEnvelope as RecoderA2AEnvelope,
	};
}

export function buildInvalidA2AEnvelopeError(input: {
	issues: ValidationIssue[];
	error?: string;
}) {
	return {
		ok: false as const,
		error: input.error || "Invalid A2A envelope",
		code: INVALID_A2A_ENVELOPE_CODE,
		schemaVersion: A2A_ENVELOPE_ERROR_SCHEMA_VERSION,
		issues: input.issues,
	};
}

export async function verifyIncomingA2ARequest(input: {
	headers: Headers;
	rawBody: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const secret = process.env.RECODER_A2A_SHARED_SECRET || "";
	if (!secret) {
		return { ok: false, status: 503, error: "RECODER_A2A_SHARED_SECRET is not configured" };
	}

	const senderId = input.headers.get("x-recoder-a2a-agent-id")?.trim();
	if (!senderId) return { ok: false, status: 401, error: "Missing x-recoder-a2a-agent-id header" };

	const allowedAgents = parseAllowedAgents();
	if (allowedAgents.size > 0 && !allowedAgents.has(senderId)) {
		return { ok: false, status: 403, error: "Sender agent is not allowed" };
	}

	const timestamp = input.headers.get("x-recoder-a2a-timestamp");
	const signature = input.headers.get("x-recoder-a2a-signature");
	if (!timestamp || !signature) {
		return { ok: false, status: 401, error: "Missing signature headers" };
	}

	const timestampMs = normalizeTimestampMs(timestamp);
	if (!Number.isFinite(timestampMs)) {
		return { ok: false, status: 400, error: "Invalid x-recoder-a2a-timestamp header" };
	}

	const nowMs = Date.now();
	if (Math.abs(nowMs - timestampMs) > MAX_CLOCK_SKEW_MS) {
		return { ok: false, status: 401, error: "Signature timestamp outside acceptable window" };
	}

	const expected = await hmacHex(secret, `${timestamp}.${input.rawBody}`);
	if (!secureEqual(expected, normalizeSignature(signature))) {
		return { ok: false, status: 401, error: "Signature verification failed" };
	}

	return { ok: true };
}

export async function checkAndStoreEnvelopeIdempotency(envelope: RecoderA2AEnvelope): Promise<{
	accepted: boolean;
	duplicate: boolean;
}> {
	const nowMs = Date.now();
	cleanIdempotencyStore(nowMs);

	if (!envelope?.messageId) return { accepted: false, duplicate: false };

	const redis = await getRedisClient();
	if (redis) {
		try {
			const key = `${IDEMPOTENCY_KEY_PREFIX}:${envelope.messageId}`;
			const ttlSeconds = Math.max(1, Math.ceil(IDEMPOTENCY_TTL_MS / 1000));
			const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
			return { accepted: true, duplicate: result !== "OK" };
		} catch {
			// Fallback to in-memory if Redis is unavailable.
		}
	}

	const existingExpiry = idempotencyStore.get(envelope.messageId);
	if (existingExpiry && existingExpiry > nowMs) return { accepted: true, duplicate: true };

	idempotencyStore.set(envelope.messageId, nowMs + IDEMPOTENCY_TTL_MS);
	return { accepted: true, duplicate: false };
}

function resolveIntentWebhook(intent: string): string {
	switch (intent) {
		case "plan":
			return process.env.RECODER_A2A_PLAN_HANDLER_URL || "";
		case "execute":
			return process.env.RECODER_A2A_EXECUTE_HANDLER_URL || "";
		case "handoff":
			return process.env.RECODER_A2A_HANDOFF_HANDLER_URL || "";
		case "tool_call":
			return process.env.RECODER_A2A_TOOL_CALL_HANDLER_URL || "";
		default:
			return "";
	}
}

async function dispatchIntentToBackend(envelope: RecoderA2AEnvelope): Promise<Record<string, unknown>> {
	const details: Record<string, unknown> = {};
	const targetService = String((envelope as any)?.to?.platform || (envelope as any)?.to?.id || "");
	const fromService = String((envelope as any)?.from?.platform || (envelope as any)?.from?.id || "");
	const redis = await getRedisClient();

	if (redis) {
		try {
			const streamId = await redis.xadd(
				INTENT_STREAM_KEY,
				"*",
				"service",
				"recoder-agency",
				"fromService",
				fromService || "recoder_agency",
				"targetService",
				targetService || "unknown",
				"intent",
				String(envelope.intent),
				"messageId",
				String(envelope.messageId),
				"threadId",
				String(envelope.threadId),
				"payload",
				JSON.stringify(envelope.payload ?? []),
				"envelope",
				JSON.stringify(envelope),
			);
			details.redis = { queued: true, streamKey: INTENT_STREAM_KEY, streamId };
		} catch (error) {
			details.redis = { queued: false, error: error instanceof Error ? error.message : "xadd_failed" };
		}
	} else {
		details.redis = { queued: false, reason: "redis_not_configured" };
	}

	const webhookUrl = resolveIntentWebhook(String(envelope.intent));
	if (webhookUrl) {
		try {
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ envelope }),
			});
			details.webhook = { dispatched: response.ok, status: response.status, url: webhookUrl };
		} catch (error) {
			details.webhook = { dispatched: false, url: webhookUrl, error: error instanceof Error ? error.message : "fetch_failed" };
		}
	}

	return details;
}

export async function signOutgoingA2ARequest(rawBody: string): Promise<{
	timestamp: string;
	signature: string;
}> {
	const secret = process.env.RECODER_A2A_SHARED_SECRET || "";
	if (!secret) {
		throw new Error("RECODER_A2A_SHARED_SECRET is not configured");
	}

	const timestamp = `${Math.floor(Date.now() / 1000)}`;
	const digest = await hmacHex(secret, `${timestamp}.${rawBody}`);
	return { timestamp, signature: `v1=${digest}` };
}

export function isAllowedTarget(targetUrl: string): boolean {
	const allowListRaw = process.env.RECODER_A2A_EGRESS_ALLOWLIST || "";
	const allowList = allowListRaw
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	if (allowList.length === 0) return true;
	return allowList.some((allowedPrefix) => targetUrl.startsWith(allowedPrefix));
}

export async function handleA2AIntent(envelope: RecoderA2AEnvelope): Promise<{
	handled: boolean;
	status: "accepted" | "ignored";
	action: string;
	details?: Record<string, unknown>;
}> {
	switch (envelope.intent) {
		case "plan":
			return { handled: true, status: "accepted", action: "plan_registered", details: await dispatchIntentToBackend(envelope) };
		case "execute":
			return { handled: true, status: "accepted", action: "execution_requested", details: await dispatchIntentToBackend(envelope) };
		case "handoff":
			return { handled: true, status: "accepted", action: "handoff_received", details: await dispatchIntentToBackend(envelope) };
		case "tool_call":
			return { handled: true, status: "accepted", action: "tool_call_received", details: await dispatchIntentToBackend(envelope) };
		default:
			return { handled: false, status: "ignored", action: "unsupported_intent" };
	}
}

export function agencyAgentCard() {
	const baseUrl = process.env.AGENCY_PUBLIC_URL || "https://agency.recoder.xyz";
	return {
		name: "Recoder Agency Agent",
		description: "Agency workflow and delivery orchestration agent",
		protocolVersion: "0.3.0",
		version: "1.0.0",
		url: `${baseUrl}/api/a2a/envelope`,
		skills: [
			{ id: "delivery", name: "Delivery Ops", description: "Agency delivery lifecycle", tags: ["agency", "delivery"] },
			{ id: "client-sync", name: "Client Sync", description: "Client communication workflows", tags: ["client", "sync"] },
		],
		capabilities: {
			streaming: true,
			pushNotifications: false,
		},
		defaultInputModes: ["text", "application/json"],
		defaultOutputModes: ["text", "application/json"],
	};
}

export async function __createSignatureForTest(timestamp: string, rawBody: string, secret: string): Promise<string> {
	return hmacHex(secret, `${timestamp}.${rawBody}`);
}

export function __resetA2ATestState(): void {
	idempotencyStore.clear();
}
