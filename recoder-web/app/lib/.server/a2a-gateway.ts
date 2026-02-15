import {
  buildInvalidA2AEnvelopeErrorResponse,
  type A2AEnvelopeValidationIssue,
  type RecoderA2AEnvelope,
} from '@recoder/shared/a2a';

type VerifyResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export type IntentResult = {
  handled: boolean;
  status: 'accepted' | 'ignored' | 'error';
  action: string;
  details?: Record<string, unknown>;
};

const MAX_CLOCK_SKEW_MS = Number(process.env.RECODER_A2A_MAX_SKEW_MS || 5 * 60 * 1000);
const IDEMPOTENCY_TTL_MS = Number(process.env.RECODER_A2A_IDEMPOTENCY_TTL_MS || 10 * 60 * 1000);
const IDEMPOTENCY_KEY_PREFIX = process.env.RECODER_A2A_IDEMPOTENCY_KEY_PREFIX || 'recoder:a2a:idempotency';
const INTENT_STREAM_KEY = process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents';
const RECODER_A2A_PROTOCOL_VERSION = '0.3.0';
const RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
const VALID_RECORDER_INTENTS = new Set([
  'plan',
  'execute',
  'review',
  'handoff',
  'status',
  'sync',
  'tool_call',
  'tool_result',
  'error',
]);
const VALID_RECORDER_PLATFORMS = new Set([
  'codex',
  'claude_code',
  'recoder_web',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
]);

type GatewayAgentPlatform =
  | 'codex'
  | 'claude_code'
  | 'recoder_web'
  | 'recoder_pm'
  | 'recoder_agency'
  | 'recoder_backend'
  | 'recoder_desktop'
  | 'custom';
type GatewayEnvelope = RecoderA2AEnvelope & {
  envelopeVersion: string;
  protocolVersion: string;
  createdAt: string;
  from: {
    id: string;
    name: string;
    platform: GatewayAgentPlatform;
    instanceId?: string;
    team?: string;
    version?: string;
  };
  to: {
    id: string;
    name: string;
    platform: GatewayAgentPlatform;
    instanceId?: string;
    team?: string;
    version?: string;
  };
  payload: unknown[];
  metadata?: Record<string, unknown>;
  trace?: {
    traceId: string;
    parentMessageId?: string;
  };
};
export type EnvelopeValidationIssue = A2AEnvelopeValidationIssue;

type RedisLike = {
  connect: () => Promise<void>;
  set: (...args: any[]) => Promise<any>;
  xadd: (...args: any[]) => Promise<any>;
};

const idempotencyStore = new Map<string, number>();
let redisClient: RedisLike | null = null;
let redisLoadAttempted = false;

function getRedisUrl(): string {
  return process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
}

async function getRedisClient(): Promise<RedisLike | null> {
  const url = getRedisUrl();
  if (!url) return null;

  if (redisClient) return redisClient;
  if (redisLoadAttempted) return null;
  redisLoadAttempted = true;

  try {
    const moduleName = process.env.RECODER_A2A_REDIS_MODULE || 'ioredis';
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
    (process.env.RECODER_A2A_ALLOWED_AGENTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizePlatform(value: unknown): GatewayAgentPlatform {
  const platform = asString(value).trim();
  if (VALID_RECORDER_PLATFORMS.has(platform)) {
    return platform as GatewayAgentPlatform;
  }
  return 'custom';
}

export function parseEnvelopeFromUnknown(
  value: unknown,
  sourcePath = 'envelope',
): { ok: true; envelope: GatewayEnvelope } | { ok: false; issues: EnvelopeValidationIssue[] } {
  const issues: EnvelopeValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: sourcePath, message: 'must be an object' }] };
  }

  const messageId = asString(value.messageId).trim();
  const threadId = asString(value.threadId).trim();
  const intent = asString(value.intent).trim();
  if (!messageId) issues.push({ path: `${sourcePath}.messageId`, message: 'must be a non-empty string' });
  if (!threadId) issues.push({ path: `${sourcePath}.threadId`, message: 'must be a non-empty string' });
  if (!intent || !VALID_RECORDER_INTENTS.has(intent)) {
    issues.push({
      path: `${sourcePath}.intent`,
      message: 'must be one of plan, execute, review, handoff, status, sync, tool_call, tool_result, error',
    });
  }

  const fromInput = value.from;
  const toInput = value.to;
  if (!isRecord(fromInput)) {
    issues.push({ path: `${sourcePath}.from`, message: 'must be an object' });
  }
  if (!isRecord(toInput)) {
    issues.push({ path: `${sourcePath}.to`, message: 'must be an object' });
  }

  const fromId = isRecord(fromInput) ? asString(fromInput.id).trim() : '';
  const toId = isRecord(toInput) ? asString(toInput.id).trim() : '';
  if (!fromId) issues.push({ path: `${sourcePath}.from.id`, message: 'must be a non-empty string' });
  if (!toId) issues.push({ path: `${sourcePath}.to.id`, message: 'must be a non-empty string' });

  const payloadInput = value.payload;
  if (!Array.isArray(payloadInput)) {
    issues.push({ path: `${sourcePath}.payload`, message: 'must be an array' });
  }

  const createdAtInput = asString(value.createdAt).trim();
  const createdAt = createdAtInput || new Date().toISOString();
  if (createdAtInput && Number.isNaN(Date.parse(createdAtInput))) {
    issues.push({ path: `${sourcePath}.createdAt`, message: 'must be a valid ISO-8601 timestamp string' });
  }

  if (issues.length > 0) return { ok: false, issues };

  const fromRecord = fromInput as Record<string, unknown>;
  const toRecord = toInput as Record<string, unknown>;
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const traceRaw = value.trace;
  const trace = isRecord(traceRaw) && asString(traceRaw.traceId).trim()
    ? {
        traceId: asString(traceRaw.traceId).trim(),
        parentMessageId: asString(traceRaw.parentMessageId).trim() || undefined,
      }
    : undefined;

  return {
    ok: true,
    envelope: {
      envelopeVersion: asString(value.envelopeVersion).trim() || RECODER_A2A_ENVELOPE_VERSION,
      protocolVersion: asString(value.protocolVersion).trim() || RECODER_A2A_PROTOCOL_VERSION,
      messageId,
      threadId,
      createdAt,
      from: {
        id: fromId,
        name: asString(fromRecord.name).trim() || fromId,
        platform: normalizePlatform(fromRecord.platform),
        instanceId: asString(fromRecord.instanceId).trim() || undefined,
        team: asString(fromRecord.team).trim() || undefined,
        version: asString(fromRecord.version).trim() || undefined,
      },
      to: {
        id: toId,
        name: asString(toRecord.name).trim() || toId,
        platform: normalizePlatform(toRecord.platform),
        instanceId: asString(toRecord.instanceId).trim() || undefined,
        team: asString(toRecord.team).trim() || undefined,
        version: asString(toRecord.version).trim() || undefined,
      },
      intent: intent as GatewayEnvelope['intent'],
      payload: payloadInput as any,
      metadata,
      trace,
    },
  };
}

export function buildInvalidA2AEnvelopeError(input: {
  issues: EnvelopeValidationIssue[];
  error?: string;
}) {
  return buildInvalidA2AEnvelopeErrorResponse(input);
}

function normalizeSignature(value: string): string {
  return value.startsWith('v1=') ? value.slice(3) : value;
}

function normalizeTimestampMs(value: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cleanIdempotencyStore(nowMs: number): void {
  for (const [messageId, expiresAt] of idempotencyStore.entries()) {
    if (expiresAt <= nowMs) idempotencyStore.delete(messageId);
  }
}

export async function verifyIncomingA2ARequest(input: {
  headers: Headers;
  rawBody: string;
}): Promise<VerifyResult> {
  const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (!secret) {
    return { ok: false, status: 503, error: 'RECODER_A2A_SHARED_SECRET is not configured' };
  }

  const senderId = input.headers.get('x-recoder-a2a-agent-id')?.trim();
  if (!senderId) return { ok: false, status: 401, error: 'Missing x-recoder-a2a-agent-id header' };

  const allowedAgents = parseAllowedAgents();
  if (allowedAgents.size > 0 && !allowedAgents.has(senderId)) {
    return { ok: false, status: 403, error: 'Sender agent is not allowed' };
  }

  const timestamp = input.headers.get('x-recoder-a2a-timestamp');
  const signature = input.headers.get('x-recoder-a2a-signature');
  if (!timestamp || !signature) {
    return { ok: false, status: 401, error: 'Missing signature headers' };
  }

  const timestampMs = normalizeTimestampMs(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, status: 400, error: 'Invalid x-recoder-a2a-timestamp header' };
  }

  const nowMs = Date.now();
  if (Math.abs(nowMs - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, status: 401, error: 'Signature timestamp outside acceptable window' };
  }

  const expected = await hmacHex(secret, `${timestamp}.${input.rawBody}`);
  if (!secureEqual(expected, normalizeSignature(signature))) {
    return { ok: false, status: 401, error: 'Signature verification failed' };
  }

  return { ok: true };
}

export async function signOutgoingA2ARequest(rawBody: string): Promise<{
  timestamp: string;
  signature: string;
}> {
  const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (!secret) {
    throw new Error('RECODER_A2A_SHARED_SECRET is not configured');
  }

  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const digest = await hmacHex(secret, `${timestamp}.${rawBody}`);

  return {
    timestamp,
    signature: `v1=${digest}`,
  };
}

export async function checkAndStoreEnvelopeIdempotency(envelope: RecoderA2AEnvelope): Promise<{
  accepted: boolean;
  duplicate: boolean;
}> {
  const nowMs = Date.now();
  cleanIdempotencyStore(nowMs);

  if (!envelope?.messageId) {
    return { accepted: false, duplicate: false };
  }

  const redis = await getRedisClient();
  if (redis) {
    try {
      const key = `${IDEMPOTENCY_KEY_PREFIX}:${envelope.messageId}`;
      const ttlSeconds = Math.max(1, Math.ceil(IDEMPOTENCY_TTL_MS / 1000));
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return { accepted: true, duplicate: result !== 'OK' };
    } catch {
      // Fallback to in-memory if Redis is unavailable.
    }
  }

  const existingExpiry = idempotencyStore.get(envelope.messageId);
  if (existingExpiry && existingExpiry > nowMs) {
    return { accepted: true, duplicate: true };
  }

  idempotencyStore.set(envelope.messageId, nowMs + IDEMPOTENCY_TTL_MS);
  return { accepted: true, duplicate: false };
}

function resolveIntentWebhook(intent: string): string {
  switch (intent) {
    case 'plan':
      return process.env.RECODER_A2A_PLAN_HANDLER_URL || '';
    case 'execute':
      return process.env.RECODER_A2A_EXECUTE_HANDLER_URL || '';
    case 'handoff':
      return process.env.RECODER_A2A_HANDOFF_HANDLER_URL || '';
    case 'tool_call':
      return process.env.RECODER_A2A_TOOL_CALL_HANDLER_URL || '';
    default:
      return '';
  }
}

async function dispatchIntentToBackend(envelope: GatewayEnvelope): Promise<Record<string, unknown>> {
  const details: Record<string, unknown> = {};
  const targetService = String((envelope as any)?.to?.platform || (envelope as any)?.to?.id || '');
  const fromService = String((envelope as any)?.from?.platform || (envelope as any)?.from?.id || '');
  const redis = await getRedisClient();

  if (redis) {
    try {
      const streamId = await redis.xadd(
        INTENT_STREAM_KEY,
        '*',
        'service',
        'recoder-web',
        'fromService',
        fromService || 'recoder_web',
        'targetService',
        targetService || 'unknown',
        'intent',
        String(envelope.intent),
        'messageId',
        String(envelope.messageId),
        'threadId',
        String(envelope.threadId),
        'payload',
        JSON.stringify(envelope.payload ?? []),
        'envelope',
        JSON.stringify(envelope),
      );
      details.redis = { queued: true, streamKey: INTENT_STREAM_KEY, streamId };
    } catch (error) {
      details.redis = { queued: false, error: 'xadd_failed' };
    }
  } else {
    details.redis = { queued: false, reason: 'redis_not_configured' };
  }

  const webhookUrl = resolveIntentWebhook(String(envelope.intent));
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelope }),
      });
      details.webhook = { dispatched: response.ok, status: response.status };
    } catch (error) {
      details.webhook = { dispatched: false, error: 'fetch_failed' };
    }
  }

  return details;
}

export async function handleA2AIntent(envelope: GatewayEnvelope): Promise<IntentResult> {
  switch (envelope.intent) {
    case 'plan':
      return { handled: true, status: 'accepted', action: 'plan_registered', details: await dispatchIntentToBackend(envelope) };
    case 'execute':
      return { handled: true, status: 'accepted', action: 'execution_requested', details: await dispatchIntentToBackend(envelope) };
    case 'handoff':
      return { handled: true, status: 'accepted', action: 'handoff_received', details: await dispatchIntentToBackend(envelope) };
    case 'tool_call':
      return { handled: true, status: 'accepted', action: 'tool_call_received', details: await dispatchIntentToBackend(envelope) };
    default:
      return { handled: false, status: 'ignored', action: 'unsupported_intent', details: { intent: envelope.intent } };
  }
}

export function toAgentCard(serviceBaseUrl: string) {
  return {
    name: 'Recoder Web Agent',
    description: 'Recoder Web orchestration and execution gateway',
    protocolVersion: '0.3.0',
    version: '1.0.0',
    url: `${serviceBaseUrl}/api/a2a/envelope`,
    skills: [
      { id: 'plan', name: 'Planning', description: 'Cross-service planning', tags: ['plan', 'workflow'] },
      { id: 'execute', name: 'Execution', description: 'Task execution and delegation', tags: ['execute', 'agent'] },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: ['text', 'application/json'],
    defaultOutputModes: ['text', 'application/json'],
  };
}

export async function __createSignatureForTest(timestamp: string, rawBody: string, secret: string): Promise<string> {
  return hmacHex(secret, `${timestamp}.${rawBody}`);
}

export function __resetA2ATestState(): void {
  idempotencyStore.clear();
}
