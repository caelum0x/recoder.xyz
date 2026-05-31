import { Router, type Request, type Response } from 'express';
import Redis from 'ioredis';
import {
  buildInvalidA2AEnvelopeErrorResponse,
  type A2AEnvelopeValidationIssue,
  type RecoderA2AEnvelope,
} from '@recoder/shared/a2a';
import {
  getAgentRegistryService,
  ReservedAgentIdError,
  type ReconcileSessionInput,
} from './a2a/agent-registry.service';
import type { RecoderAgentPlatform } from '@recoder/shared/a2a';

const router = Router();

// A2A Agent Card (standard A2A protocol discovery)
router.get('/.well-known/agent.json', (_req: Request, res: Response) => {
  res.json({
    name: 'Recoder Platform',
    description: 'AI agent platform with coding, PM, agency, and A2A capabilities',
    url: 'https://docker.recoder.xyz/api/a2a',
    version: '2.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [
      { id: 'coding', name: 'Code Generation', description: 'Create and edit code in sandboxed environments' },
      { id: 'tasks', name: 'Task Management', description: 'Create, assign, and track tasks across agents' },
      { id: 'search', name: 'Code Search', description: 'Search code across projects using vector + text search' },
    ],
    authentication: { schemes: ['hmac_shared_secret'] },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
  });
});

// A2A discovery/index endpoint
router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Recoder A2A Gateway',
    version: '2.0',
    protocol: 'Agent-to-Agent (A2A)',
    docs: 'https://recoder.xyz/docs/a2a',
    endpoints: {
      agents: '/api/a2a/agents',
      tasks: '/api/a2a/tasks',
      channels: '/api/a2a/channels',
      heartbeat: '/api/a2a/heartbeat',
    },
  });
});

const MAX_CLOCK_SKEW_MS = Number(process.env.RECODER_A2A_MAX_SKEW_MS || 5 * 60 * 1000);
const IDEMPOTENCY_TTL_MS = Number(process.env.RECODER_A2A_IDEMPOTENCY_TTL_MS || 10 * 60 * 1000);
const IDEMPOTENCY_KEY_PREFIX = process.env.RECODER_A2A_IDEMPOTENCY_KEY_PREFIX || 'recoder:a2a:idempotency';
const INTENT_STREAM_KEY = process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents';
const AGENT_REGISTRY_KEY = process.env.RECODER_A2A_AGENT_REGISTRY_KEY || 'recoder:a2a:agents';
const ORCHESTRATION_POLICY_KEY = process.env.RECODER_A2A_ORCH_POLICY_KEY || 'recoder:a2a:orchestration:policy';
const ORCHESTRATION_KEY_PREFIX = process.env.RECODER_A2A_ORCH_KEY_PREFIX || 'recoder:a2a:orchestration';
const ORCHESTRATION_TTL_MS = Number(process.env.RECODER_A2A_ORCH_TTL_MS || 24 * 60 * 60 * 1000);
const BRIDGE_JOB_QUEUE_PREFIX = process.env.RECODER_A2A_BRIDGE_JOB_QUEUE_PREFIX || 'recoder:a2a:bridge:jobs';
const BRIDGE_RESULT_KEY_PREFIX = process.env.RECODER_A2A_BRIDGE_RESULT_KEY_PREFIX || 'recoder:a2a:bridge:results';
const BRIDGE_RESULT_ACK_KEY_PREFIX = process.env.RECODER_A2A_BRIDGE_RESULT_ACK_KEY_PREFIX || 'recoder:a2a:bridge:result-ack';
const BRIDGE_HEARTBEAT_KEY_PREFIX = process.env.RECODER_A2A_BRIDGE_HEARTBEAT_KEY_PREFIX || 'recoder:a2a:bridge:heartbeat';
const BRIDGE_HEARTBEAT_TTL_MS = Number(process.env.RECODER_A2A_BRIDGE_HEARTBEAT_TTL_MS || 60 * 1000);
const BRIDGE_SESSION_KEY_PREFIX = process.env.RECODER_A2A_BRIDGE_SESSION_KEY_PREFIX || 'recoder:a2a:bridge:sessions';
const BRIDGE_SESSION_TTL_MS = Number(process.env.RECODER_A2A_BRIDGE_SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const A2A_AUDIT_STREAM_KEY = process.env.RECODER_A2A_AUDIT_STREAM_KEY || 'recoder:a2a:audit';
const A2A_AUDIT_TTL_MS = Number(process.env.RECODER_A2A_AUDIT_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const A2A_ORCH_MAX_TARGETS = Math.max(1, Number(process.env.RECODER_A2A_ORCH_MAX_TARGETS || 2));
const A2A_ORCH_MAX_DEADLINE_MS = Math.max(1000, Number(process.env.RECODER_A2A_ORCH_MAX_DEADLINE_MS || 10 * 60 * 1000));
const A2A_HISTORY_STREAM_BUFFER_SIZE = Math.max(10, Number(process.env.RECODER_A2A_HISTORY_STREAM_BUFFER_SIZE || 200));
const A2A_HISTORY_STREAM_KEY_PREFIX = process.env.RECODER_A2A_HISTORY_STREAM_KEY_PREFIX || 'recoder:a2a:history:stream';
const A2A_HISTORY_STREAM_POLL_MS = Math.max(250, Number(process.env.RECODER_A2A_HISTORY_STREAM_POLL_MS || 1000));
const A2A_SCOPE_HEADER = process.env.RECODER_A2A_SCOPE_HEADER || 'x-recoder-a2a-scope';
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

const idempotencyStore = new Map<string, number>();
const agentRegistryStore = new Map<string, AgentRegistryEntry>();
let orchestrationPolicyStore: OrchestrationPolicy | null = null;
const orchestrationStore = new Map<string, { expiresAt: number; value: string }>();
const bridgeJobQueueStore = new Map<string, BridgeJob[]>();
const bridgeResultStore = new Map<string, { expiresAt: number; value: string }>();
const bridgeResultAckStore = new Map<string, number>();
const bridgeHeartbeatStore = new Map<string, { expiresAt: number; value: string }>();
const bridgeSessionStore = new Map<string, { expiresAt: number; value: string }>();
const auditStore = new Map<string, { expiresAt: number; value: string }>();
const orchestrationHistorySubscribers = new Map<string, Set<HistorySubscriber>>();
const orchestrationHistoryEventLog = new Map<string, HistoryStreamEvent[]>();
let redisClient: Redis | null = null;

type AgentAuthMode = 'none' | 'hmac_shared_secret';
type AgentHealth = 'unknown' | 'healthy' | 'unhealthy';
type OrchestrationMode = 'codex_only' | 'claude_only' | 'parallel' | 'handoff' | 'fallback';
type AgentRegistryEntry = {
  agent_id: string;
  platform: string;
  base_url: string;
  enabled: boolean;
  auth_mode: AgentAuthMode;
  health: AgentHealth;
  updated_at: string;
};
type BridgeJob = {
  jobId: string;
  agentId: string;
  envelope: RecoderA2AEnvelope;
  traceId?: string;
  scope?: string | null;
  enqueuedAt: string;
};
type BridgeSession = {
  token: string;
  bridgeId: string;
  scope?: string | null;
  createdAt: string;
  expiresAt: string;
  issuedBy: string;
};
type AuditEvent = {
  id: string;
  at: string;
  event: string;
  details: Record<string, unknown>;
};
type OrchestrationPolicy = {
  allowedIntents: string[];
  maxTargets: number;
  maxDeadlineMs: number;
  requireDualApprovalIntents: string[];
  updatedAt: string;
};
type OverrideHistoryEntry = {
  at: string;
  by: string;
  winnerAgentId: string;
  previousWinnerAgentId: string | null;
  reason: string;
};
type HistoryStreamEvent = {
  id: string;
  at: string;
  eventType: string;
  threadId: string;
  traceId: string;
  detail: Record<string, unknown> | null;
  history: Record<string, unknown> | null;
};
type HistorySubscriber = {
  res: Response;
  eventTypes: Set<string> | null;
  sinceAtMs: number | null;
  lastEventId: string | null;
};
export type EnvelopeValidationIssue = A2AEnvelopeValidationIssue;
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

function parseEnvelopeFromUnknown(
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
      intent,
      payload: payloadInput as unknown[],
      metadata,
      trace,
    },
  };
}

function respondInvalidEnvelope(
  res: Response,
  issues: EnvelopeValidationIssue[],
  error = 'Invalid A2A envelope',
): void {
  res.status(400).json(buildInvalidA2AEnvelopeError({ issues, error }));
}

export function buildInvalidA2AEnvelopeError(input: {
  issues: EnvelopeValidationIssue[];
  error?: string;
}) {
  return buildInvalidA2AEnvelopeErrorResponse(input);
}

function orchestrationStateKey(threadId: string, traceId: string): string {
  return `${threadId}:${traceId}`;
}

function resolveHistoryStreamKey(threadId: string, traceId: string): string {
  return `${A2A_HISTORY_STREAM_KEY_PREFIX}:${threadId}:${traceId}`;
}

function getRedisUrl(): string {
  return process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
}

function getRedisClient(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;

  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    void redisClient.connect().catch(() => {
      redisClient = null;
    });
  }

  return redisClient;
}

function parseAllowedAgents(): Set<string> {
  return new Set(
    (process.env.RECODER_A2A_ALLOWED_AGENTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
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
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

function cleanOrchestrationStore(nowMs: number): void {
  for (const [key, value] of orchestrationStore.entries()) {
    if (value.expiresAt <= nowMs) orchestrationStore.delete(key);
  }
}

function cleanBridgeState(nowMs: number): void {
  for (const [key, value] of bridgeResultStore.entries()) {
    if (value.expiresAt <= nowMs) bridgeResultStore.delete(key);
  }
  for (const [jobId, expiresAt] of bridgeResultAckStore.entries()) {
    if (expiresAt <= nowMs) bridgeResultAckStore.delete(jobId);
  }
  for (const [key, value] of bridgeHeartbeatStore.entries()) {
    if (value.expiresAt <= nowMs) bridgeHeartbeatStore.delete(key);
  }
  for (const [token, value] of bridgeSessionStore.entries()) {
    if (value.expiresAt <= nowMs) bridgeSessionStore.delete(token);
  }
  for (const [id, value] of auditStore.entries()) {
    if (value.expiresAt <= nowMs) auditStore.delete(id);
  }
}

function builtinAgentEntries(): AgentRegistryEntry[] {
  const nowIso = new Date().toISOString();
  return [
    {
      agent_id: 'codex',
      platform: 'codex',
      base_url: process.env.RECODER_A2A_CODEX_BASE_URL || '',
      enabled: process.env.RECODER_A2A_ENABLE_CODEX === 'true',
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
    {
      agent_id: 'claude_code',
      platform: 'claude_code',
      base_url: process.env.RECODER_A2A_CLAUDE_CODE_BASE_URL || '',
      enabled: process.env.RECODER_A2A_ENABLE_CLAUDE_CODE === 'true',
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
    {
      agent_id: 'recoder_web',
      platform: 'recoder_web',
      base_url: process.env.RECODER_WEB_URL || '',
      enabled: true,
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
    {
      agent_id: 'recoder_agency',
      platform: 'recoder_agency',
      base_url: process.env.AGENCY_PUBLIC_URL || '',
      enabled: true,
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
    {
      agent_id: 'recoder_pm',
      platform: 'recoder_pm',
      base_url: process.env.PM_API_PUBLIC_URL || '',
      enabled: true,
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
    {
      agent_id: 'recoder_backend',
      platform: 'recoder_backend',
      base_url: process.env.DOCKER_BACKEND_PUBLIC_URL || '',
      enabled: true,
      auth_mode: 'hmac_shared_secret',
      health: 'unknown',
      updated_at: nowIso,
    },
  ];
}

async function listAgentRegistry(): Promise<AgentRegistryEntry[]> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const rows = await redis.hgetall(AGENT_REGISTRY_KEY);
      const parsed = Object.values(rows)
        .map((value) => {
          try {
            return JSON.parse(value) as AgentRegistryEntry;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as AgentRegistryEntry[];

      if (parsed.length > 0) return parsed;
    } catch {
      // fall back
    }
  }

  if (agentRegistryStore.size === 0) {
    for (const entry of builtinAgentEntries()) {
      agentRegistryStore.set(entry.agent_id, entry);
    }
  }
  return Array.from(agentRegistryStore.values());
}

async function upsertAgentRegistryEntry(entry: AgentRegistryEntry): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.hset(AGENT_REGISTRY_KEY, entry.agent_id, JSON.stringify(entry));
      return;
    } catch {
      // fall back
    }
  }
  agentRegistryStore.set(entry.agent_id, entry);
}

async function getAgentRegistryEntry(agentId: string): Promise<AgentRegistryEntry | null> {
  const all = await listAgentRegistry();
  return all.find((entry) => entry.agent_id === agentId) || null;
}

function parseTokenScopeMap(raw: string): Map<string, string> {
  const value = String(raw || '').trim();
  if (!value) return new Map();
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .map(([token, scope]) => [token.trim(), String(scope || '').trim()] as const)
      .filter(([token, scope]) => Boolean(token && scope));
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function verifyAdminToken(req: Request): { ok: true; scope: string | null } | { ok: false; status: number; error: string } {
  const provided = String(req.header('x-recoder-a2a-admin-token') || '').trim();
  const scopedMap = parseTokenScopeMap(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES || '');
  if (scopedMap.size > 0) {
    const scope = scopedMap.get(provided) || null;
    if (!provided || !scope) {
      return { ok: false, status: 401, error: 'Unauthorized admin token' };
    }
    return { ok: true, scope };
  }

  const expected = process.env.RECODER_A2A_ADMIN_TOKEN || '';
  if (!expected) return { ok: true, scope: null };
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized admin token' };
  }
  const scope = String(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE || '').trim() || null;
  return { ok: true, scope };
}

function verifyBridgeToken(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const authHeader = String(req.header('authorization') || '');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearerToken) return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  return { ok: true };
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

function normalizeMode(value: unknown): OrchestrationMode {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'codex_only') return 'codex_only';
  if (mode === 'claude_only') return 'claude_only';
  if (mode === 'parallel') return 'parallel';
  if (mode === 'handoff') return 'handoff';
  if (mode === 'fallback') return 'fallback';
  return 'parallel';
}

export async function verifyIncomingRequest(input: {
  headers: Record<string, string | undefined>;
  rawBody: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (!secret) return { ok: false, status: 503, error: 'RECODER_A2A_SHARED_SECRET is not configured' };

  const senderId = String(input.headers['x-recoder-a2a-agent-id'] || '').trim();
  if (!senderId) return { ok: false, status: 401, error: 'Missing x-recoder-a2a-agent-id header' };

  const allowedAgents = parseAllowedAgents();
  if (allowedAgents.size > 0 && !allowedAgents.has(senderId)) {
    return { ok: false, status: 403, error: 'Sender agent is not allowed' };
  }

  const timestamp = input.headers['x-recoder-a2a-timestamp'];
  const signature = input.headers['x-recoder-a2a-signature'];
  if (!timestamp || !signature) return { ok: false, status: 401, error: 'Missing signature headers' };

  const timestampMs = normalizeTimestampMs(timestamp);
  if (!Number.isFinite(timestampMs)) return { ok: false, status: 400, error: 'Invalid x-recoder-a2a-timestamp header' };

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

export async function checkAndStoreEnvelopeIdempotency(envelope: RecoderA2AEnvelope): Promise<{ accepted: boolean; duplicate: boolean }> {
  const nowMs = Date.now();
  cleanIdempotencyStore(nowMs);

  if (!envelope?.messageId) return { accepted: false, duplicate: false };

  const redis = getRedisClient();
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
  if (existingExpiry && existingExpiry > nowMs) return { accepted: true, duplicate: true };

  idempotencyStore.set(envelope.messageId, nowMs + IDEMPOTENCY_TTL_MS);
  return { accepted: true, duplicate: false };
}

function resolveIntentWebhook(intent: string): string {
  switch (intent) {
    case 'plan':
      return process.env.RECODER_A2A_PLAN_HANDLER_URL || '';
    case 'execute':
      return process.env.RECODER_A2A_EXECUTE_HANDLER_URL || '';
    case 'review':
      return process.env.RECODER_A2A_REVIEW_HANDLER_URL || '';
    case 'handoff':
      return process.env.RECODER_A2A_HANDOFF_HANDLER_URL || '';
    case 'tool_call':
      return process.env.RECODER_A2A_TOOL_CALL_HANDLER_URL || '';
    default:
      return '';
  }
}

function resolveIntentExecutor(intent: string): string {
  switch (intent) {
    case 'plan':
      return process.env.RECODER_A2A_INTENT_PLAN_EXECUTOR_URL || '';
    case 'execute':
      return process.env.RECODER_A2A_INTENT_EXECUTE_EXECUTOR_URL || '';
    case 'review':
      return process.env.RECODER_A2A_INTENT_REVIEW_EXECUTOR_URL || '';
    case 'handoff':
      return process.env.RECODER_A2A_INTENT_HANDOFF_EXECUTOR_URL || '';
    case 'tool_call':
      return process.env.RECODER_A2A_INTENT_TOOL_CALL_EXECUTOR_URL || '';
    default:
      return '';
  }
}

function verifyWorkerTokenHeader(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.RECODER_A2A_WORKER_TOKEN || '';
  if (!expected) return { ok: true };

  const provided = String(req.header('x-recoder-a2a-worker-token') || '');
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized worker token' };
  }
  return { ok: true };
}

async function dispatchIntentToBackend(envelope: GatewayEnvelope): Promise<Record<string, unknown>> {
  const details: Record<string, unknown> = {};
  const targetService = String((envelope as any)?.to?.platform || (envelope as any)?.to?.id || '');
  const fromService = String((envelope as any)?.from?.platform || (envelope as any)?.from?.id || '');
  const redis = getRedisClient();

  if (redis) {
    try {
      const streamId = await redis.xadd(
        INTENT_STREAM_KEY,
        '*',
        'service',
        'docker-backend',
        'fromService',
        fromService || 'recoder_backend',
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

export async function handleA2AIntent(envelope: GatewayEnvelope): Promise<{
  handled: boolean;
  status: 'accepted' | 'ignored';
  action: string;
  details?: Record<string, unknown>;
}> {
  switch (envelope.intent) {
    case 'plan':
      return { handled: true, status: 'accepted', action: 'plan_registered', details: await dispatchIntentToBackend(envelope) };
    case 'execute':
      return { handled: true, status: 'accepted', action: 'execution_requested', details: await dispatchIntentToBackend(envelope) };
    case 'review':
      return { handled: true, status: 'accepted', action: 'review_requested', details: await dispatchIntentToBackend(envelope) };
    case 'handoff':
      return { handled: true, status: 'accepted', action: 'handoff_received', details: await dispatchIntentToBackend(envelope) };
    case 'tool_call':
      return { handled: true, status: 'accepted', action: 'tool_call_received', details: await dispatchIntentToBackend(envelope) };
    default:
      return { handled: false, status: 'ignored', action: 'unsupported_intent' };
  }
}

function isAllowedTarget(targetUrl: string): boolean {
  const allowListRaw = process.env.RECODER_A2A_EGRESS_ALLOWLIST || '';
  const allowList = allowListRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowList.length === 0) return true;
  return allowList.some((allowedPrefix) => targetUrl.startsWith(allowedPrefix));
}

async function dispatchSignedEnvelope(input: {
  targetUrl: string;
  envelope: RecoderA2AEnvelope;
  senderAgent?: string;
}): Promise<{ ok: boolean; status: number; targetUrl: string; responseBody: string }> {
  const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (!secret) {
    return { ok: false, status: 503, targetUrl: input.targetUrl, responseBody: 'RECODER_A2A_SHARED_SECRET is not configured' };
  }

  const rawBody = JSON.stringify(input.envelope);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const digest = await hmacHex(secret, `${timestamp}.${rawBody}`);
  const senderAgent = input.senderAgent || process.env.RECODER_A2A_AGENT_ID || 'docker-backend';

  const response = await fetch(input.targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-recoder-a2a-agent-id': senderAgent,
      'x-recoder-a2a-timestamp': timestamp,
      'x-recoder-a2a-signature': `v1=${digest}`,
    },
    body: rawBody,
  });
  return {
    ok: response.ok,
    status: response.status,
    targetUrl: input.targetUrl,
    responseBody: await response.text(),
  };
}

function selectTargets(input: {
  mode: OrchestrationMode;
  codex: AgentRegistryEntry | null;
  claude: AgentRegistryEntry | null;
  primaryAgent?: string;
  fallbackAgent?: string;
}): string[] {
  const bridgeFallbackEnabled = process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK === 'true';
  const codexReady = Boolean(input.codex?.enabled && (input.codex.base_url || bridgeFallbackEnabled));
  const claudeReady = Boolean(input.claude?.enabled && (input.claude.base_url || bridgeFallbackEnabled));
  const fallback = input.fallbackAgent === 'claude_code' ? 'claude_code' : 'codex';
  const primary = input.primaryAgent === 'claude_code' ? 'claude_code' : 'codex';

  switch (input.mode) {
    case 'codex_only':
      return codexReady ? ['codex'] : [];
    case 'claude_only':
      return claudeReady ? ['claude_code'] : [];
    case 'handoff':
      if (primary === 'claude_code') return (claudeReady ? ['claude_code'] : []).concat(codexReady ? ['codex'] : []);
      return (codexReady ? ['codex'] : []).concat(claudeReady ? ['claude_code'] : []);
    case 'fallback':
      if (primary === fallback) return primary === 'codex' && codexReady ? ['codex'] : claudeReady ? ['claude_code'] : [];
      if (primary === 'claude_code') return (claudeReady ? ['claude_code'] : []).concat(codexReady ? ['codex'] : []);
      if (primary === 'codex') return (codexReady ? ['codex'] : []).concat(claudeReady ? ['claude_code'] : []);
      return [];
    case 'parallel':
    default:
      return [codexReady ? 'codex' : '', claudeReady ? 'claude_code' : ''].filter(Boolean);
  }
}

async function persistOrchestrationState(input: {
  threadId: string;
  traceId: string;
  mode: OrchestrationMode;
  targets: string[];
  results: unknown;
  merge?: unknown;
  overrideHistory?: OverrideHistoryEntry[];
  scope?: string | null;
}): Promise<void> {
  const key = `${ORCHESTRATION_KEY_PREFIX}:${input.threadId}:${input.traceId}`;
  const value = JSON.stringify({
    threadId: input.threadId,
    traceId: input.traceId,
    mode: input.mode,
    targets: input.targets,
    results: input.results,
    merge: input.merge ?? null,
    overrideHistory: input.overrideHistory ?? [],
    scope: input.scope ?? null,
    updatedAt: new Date().toISOString(),
  });
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, 'PX', ORCHESTRATION_TTL_MS);
      return;
    } catch {
      // fall back
    }
  }
  cleanOrchestrationStore(Date.now());
  orchestrationStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}

function computeDeterministicMerge(input: {
  mode: OrchestrationMode;
  results: Array<Record<string, unknown>>;
  primaryAgent?: string;
}): Record<string, unknown> | null {
  if (input.results.length === 0) return null;
  if (input.mode !== 'parallel' && input.mode !== 'handoff' && input.mode !== 'fallback') return null;

  const primary = input.primaryAgent === 'claude_code' ? 'claude_code' : input.primaryAgent === 'codex' ? 'codex' : null;
  const scored = input.results.map((row, index) => {
    const agentId = String((row as any).agentId || '');
    const ok = Boolean((row as any).ok);
    const queued = Boolean((row as any).queued);
    const status = Number((row as any).status || 0);
    const durationMsRaw = Number((row as any).durationMs || 0);
    const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw >= 0 ? durationMsRaw : 0;
    const successScore = ok ? 1000 : 0;
    const directScore = queued ? 0 : 120;
    const statusScore = status >= 200 && status < 300 ? 40 : 0;
    const latencyScore = Math.max(0, 300 - Math.min(durationMs, 300));
    const primaryScore = primary && primary === agentId ? 25 : 0;
    const indexScore = Math.max(0, 10 - index);
    const totalScore = successScore + directScore + statusScore + latencyScore + primaryScore + indexScore;
    return {
      agentId,
      ok,
      queued,
      status,
      durationMs,
      score: totalScore,
      reasonParts: [
        ok ? 'success' : 'failure',
        queued ? 'queued' : 'direct',
        `status:${status}`,
        `durationMs:${durationMs}`,
      ],
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.agentId !== b.agentId) return a.agentId < b.agentId ? -1 : 1;
    return 0;
  });
  const winner = scored[0];
  const runnerUp = scored.length > 1 ? scored[1] : null;
  const conflictReasons: string[] = [];
  if (runnerUp && winner.score === runnerUp.score) conflictReasons.push('tie_score');
  if (!winner.ok) conflictReasons.push('winner_failed');
  if (scored.every((candidate) => !candidate.ok)) conflictReasons.push('all_failed');
  if (winner.queued) conflictReasons.push('queued_winner');
  const successfulCandidates = scored.filter((candidate) => candidate.ok);
  const collaboration = {
    mode: input.mode,
    objective: 'cooperative_execution',
    assignments: [
      { agentId: winner.agentId, role: 'driver', reason: winner.reasonParts.join(',') },
      ...(runnerUp ? [{ agentId: runnerUp.agentId, role: 'reviewer', reason: runnerUp.reasonParts.join(',') }] : []),
      ...scored
        .slice(2)
        .filter((candidate) => candidate.ok)
        .map((candidate) => ({
          agentId: candidate.agentId,
          role: 'support',
          reason: candidate.reasonParts.join(','),
        })),
    ],
    cooperationScore: successfulCandidates.length,
  };
  return {
    strategy: 'deterministic_score_v1',
    winnerAgentId: winner.agentId,
    winnerScore: winner.score,
    winnerReason: winner.reasonParts.join(','),
    conflictReasons,
    overridden: false,
    collaboration,
    candidates: scored,
  };
}

function resolveBridgeQueueKey(bridgeId: string): string {
  return `${BRIDGE_JOB_QUEUE_PREFIX}:${bridgeId}`;
}

function resolveBridgeResultKey(jobId: string): string {
  return `${BRIDGE_RESULT_KEY_PREFIX}:${jobId}`;
}

function resolveBridgeHeartbeatKey(bridgeId: string): string {
  return `${BRIDGE_HEARTBEAT_KEY_PREFIX}:${bridgeId}`;
}

function resolveBridgeResultAckKey(jobId: string): string {
  return `${BRIDGE_RESULT_ACK_KEY_PREFIX}:${jobId}`;
}

function resolveBridgeSessionKey(token: string): string {
  return `${BRIDGE_SESSION_KEY_PREFIX}:${token}`;
}

function parseAllowedIntentsForOrchestrator(): Set<string> {
  const raw = String(process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS || 'plan,execute,handoff,tool_call,review').trim();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function parseDualApprovalIntents(): Set<string> {
  const raw = String(process.env.RECODER_A2A_ORCH_DUAL_APPROVAL_INTENTS || '').trim();
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function defaultOrchestrationPolicy(): OrchestrationPolicy {
  return {
    allowedIntents: Array.from(parseAllowedIntentsForOrchestrator()),
    maxTargets: A2A_ORCH_MAX_TARGETS,
    maxDeadlineMs: A2A_ORCH_MAX_DEADLINE_MS,
    requireDualApprovalIntents: Array.from(parseDualApprovalIntents()),
    updatedAt: new Date().toISOString(),
  };
}

async function getOrchestrationPolicy(): Promise<OrchestrationPolicy> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(ORCHESTRATION_POLICY_KEY);
      if (raw) return JSON.parse(raw) as OrchestrationPolicy;
    } catch {
      // fall back
    }
  }

  if (!orchestrationPolicyStore) orchestrationPolicyStore = defaultOrchestrationPolicy();
  return orchestrationPolicyStore;
}

async function upsertOrchestrationPolicy(next: OrchestrationPolicy): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(ORCHESTRATION_POLICY_KEY, JSON.stringify(next));
      return;
    } catch {
      // fall back
    }
  }
  orchestrationPolicyStore = next;
}

async function enqueueBridgeJob(input: { bridgeId: string; job: BridgeJob }): Promise<void> {
  const redis = getRedisClient();
  const queueKey = resolveBridgeQueueKey(input.bridgeId);
  if (redis) {
    try {
      await redis.rpush(queueKey, JSON.stringify(input.job));
      return;
    } catch {
      // fall back
    }
  }
  const queue = bridgeJobQueueStore.get(input.bridgeId) || [];
  queue.push(input.job);
  bridgeJobQueueStore.set(input.bridgeId, queue);
}

function bridgeJobMatchesScope(job: BridgeJob, scope: string | null): boolean {
  if (!scope) return true;
  return String(job.scope || '').trim() === scope;
}

async function dequeueBridgeJob(bridgeId: string, scope: string | null): Promise<BridgeJob | null> {
  const redis = getRedisClient();
  const queueKey = resolveBridgeQueueKey(bridgeId);
  if (redis) {
    try {
      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await redis.watch(queueKey);
        const rows = await redis.lrange(queueKey, 0, -1);
        if (rows.length === 0) {
          await redis.unwatch();
          return null;
        }
        const parsedRows = rows.map((raw) => {
          try {
            return JSON.parse(raw) as BridgeJob;
          } catch {
            return null;
          }
        });
        const selectedIndex = parsedRows.findIndex((job) => Boolean(job && bridgeJobMatchesScope(job, scope)));
        if (selectedIndex < 0) {
          await redis.unwatch();
          return null;
        }
        const selectedRaw = rows[selectedIndex];
        const selectedJob = parsedRows[selectedIndex];
        if (!selectedJob) {
          await redis.unwatch();
          return null;
        }

        const nextRows = rows.slice(0, selectedIndex).concat(rows.slice(selectedIndex + 1));
        const tx = redis.multi();
        tx.del(queueKey);
        if (nextRows.length > 0) tx.rpush(queueKey, ...nextRows);
        const exec = await tx.exec();
        if (exec) {
          return JSON.parse(selectedRaw) as BridgeJob;
        }
      }
      return null;
    } catch {
      // fall back
    }
  }

  const queue = bridgeJobQueueStore.get(bridgeId) || [];
  const selectedIndex = queue.findIndex((job) => bridgeJobMatchesScope(job, scope));
  const job = selectedIndex >= 0 ? (queue.splice(selectedIndex, 1)[0] ?? null) : null;
  bridgeJobQueueStore.set(bridgeId, queue);
  return job;
}

async function storeBridgeResult(input: { jobId: string; result: Record<string, unknown> }): Promise<void> {
  const key = resolveBridgeResultKey(input.jobId);
  const value = JSON.stringify({ ...input.result, updatedAt: new Date().toISOString() });
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, 'PX', ORCHESTRATION_TTL_MS);
      return;
    } catch {
      // fall back
    }
  }
  cleanBridgeState(Date.now());
  bridgeResultStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}

async function checkAndStoreBridgeResultIdempotency(jobId: string): Promise<{ accepted: boolean; duplicate: boolean }> {
  if (!jobId) return { accepted: false, duplicate: false };

  const redis = getRedisClient();
  if (redis) {
    try {
      const ttlSeconds = Math.max(1, Math.ceil(ORCHESTRATION_TTL_MS / 1000));
      const result = await redis.set(resolveBridgeResultAckKey(jobId), '1', 'EX', ttlSeconds, 'NX');
      return { accepted: true, duplicate: result !== 'OK' };
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  const hit = bridgeResultAckStore.get(jobId);
  if (hit && hit > Date.now()) return { accepted: true, duplicate: true };
  bridgeResultAckStore.set(jobId, Date.now() + ORCHESTRATION_TTL_MS);
  return { accepted: true, duplicate: false };
}

async function getBridgeResult(jobId: string): Promise<Record<string, unknown> | null> {
  const key = resolveBridgeResultKey(jobId);
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // fall back
    }
  }
  cleanBridgeState(Date.now());
  const hit = bridgeResultStore.get(key);
  if (!hit) return null;
  return JSON.parse(hit.value) as Record<string, unknown>;
}

async function storeBridgeHeartbeat(input: { bridgeId: string; payload: Record<string, unknown> }): Promise<void> {
  const key = resolveBridgeHeartbeatKey(input.bridgeId);
  const value = JSON.stringify({ ...input.payload, updatedAt: new Date().toISOString() });
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, 'PX', BRIDGE_HEARTBEAT_TTL_MS);
      return;
    } catch {
      // fall back
    }
  }
  cleanBridgeState(Date.now());
  bridgeHeartbeatStore.set(key, { expiresAt: Date.now() + BRIDGE_HEARTBEAT_TTL_MS, value });
}

async function getOrchestrationState(input: { threadId: string; traceId: string }): Promise<Record<string, unknown> | null> {
  const key = `${ORCHESTRATION_KEY_PREFIX}:${input.threadId}:${input.traceId}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // fall back
    }
  }

  cleanOrchestrationStore(Date.now());
  const hit = orchestrationStore.get(key);
  if (!hit) return null;
  return JSON.parse(hit.value) as Record<string, unknown>;
}

async function upsertOrchestrationStateRecord(input: {
  threadId: string;
  traceId: string;
  state: Record<string, unknown>;
}): Promise<void> {
  const key = `${ORCHESTRATION_KEY_PREFIX}:${input.threadId}:${input.traceId}`;
  const value = JSON.stringify({
    ...input.state,
    threadId: input.threadId,
    traceId: input.traceId,
    updatedAt: new Date().toISOString(),
  });
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, value, 'PX', ORCHESTRATION_TTL_MS);
      return;
    } catch {
      // fall back
    }
  }
  cleanOrchestrationStore(Date.now());
  orchestrationStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}

function extractResultsFromState(state: Record<string, unknown>): Array<Record<string, unknown>> {
  const value = (state as any).results;
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function extractOverrideHistoryFromState(state: Record<string, unknown>): OverrideHistoryEntry[] {
  const value = (state as any).overrideHistory;
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      at: String((entry as any)?.at || ''),
      by: String((entry as any)?.by || ''),
      winnerAgentId: String((entry as any)?.winnerAgentId || ''),
      previousWinnerAgentId: (() => {
        const candidate = (entry as any)?.previousWinnerAgentId;
        if (candidate === null || candidate === undefined || candidate === '') return null;
        return String(candidate);
      })(),
      reason: String((entry as any)?.reason || ''),
    }))
    .filter((entry) => Boolean(entry.at && entry.by && entry.winnerAgentId));
}

function getRequestScope(req: Request): string | null {
  const scope = String(req.header(A2A_SCOPE_HEADER) || '').trim();
  return scope || null;
}

function getStateScope(state: Record<string, unknown>): string | null {
  const scope = String((state as any).scope || '').trim();
  return scope || null;
}

function isScopeEnforced(): boolean {
  return process.env.RECODER_A2A_ENFORCE_SCOPE === 'true';
}

function isHeaderScopeFallbackAllowed(): boolean {
  return process.env.RECODER_A2A_ALLOW_HEADER_SCOPE_FALLBACK === 'true';
}

function resolveEffectiveScope(input: { req: Request; claimedScope: string | null }): { scope: string | null; error?: string; status?: number } {
  const headerScope = getRequestScope(input.req);
  if (input.claimedScope && headerScope && input.claimedScope !== headerScope) {
    return { scope: null, error: 'Scope claim/header mismatch', status: 403 };
  }
  if (input.claimedScope) return { scope: input.claimedScope };
  if (isHeaderScopeFallbackAllowed()) return { scope: headerScope };
  return { scope: null, error: 'Token scope claim is required', status: 400 };
}

function verifyScopeAccess(input: { req: Request; state: Record<string, unknown>; claimedScope: string | null }): { ok: true } | { ok: false; status: number; error: string } {
  if (!isScopeEnforced()) return { ok: true };
  const effective = resolveEffectiveScope({ req: input.req, claimedScope: input.claimedScope });
  if (!effective.scope) {
    return { ok: false, status: effective.status || 400, error: effective.error || 'Missing scope' };
  }
  const stateScope = getStateScope(input.state);
  if (!stateScope) return { ok: false, status: 409, error: 'Orchestration scope is missing' };
  if (effective.scope !== stateScope) return { ok: false, status: 403, error: 'Scope mismatch for orchestration access' };
  return { ok: true };
}

function buildOrchestrationHistoryPayload(input: {
  threadId: string;
  traceId: string;
  state: Record<string, unknown>;
  cursor?: number;
  limit?: number;
}): Record<string, unknown> {
  const overrideHistory = extractOverrideHistoryFromState(input.state);
  const merge = ((input.state as any).merge || null) as Record<string, unknown> | null;
  const results = extractResultsFromState(input.state);
  const timelineAll = [
    {
      at: String((input.state as any).updatedAt || new Date().toISOString()),
      type: 'orchestration_snapshot',
      detail: {
        mode: String((input.state as any).mode || ''),
        targets: (input.state as any).targets || [],
        resultCount: results.length,
      },
    },
    ...overrideHistory.map((entry) => ({
      at: entry.at,
      type: 'merge_override',
      detail: {
        by: entry.by,
        winnerAgentId: entry.winnerAgentId,
        previousWinnerAgentId: entry.previousWinnerAgentId,
        reason: entry.reason,
      },
    })),
  ];
  const totalTimelineCount = timelineAll.length;
  const normalizedCursor = Number.isFinite(Number(input.cursor)) ? Math.max(0, Number(input.cursor)) : 0;
  const normalizedLimit = Number.isFinite(Number(input.limit)) ? Math.min(200, Math.max(1, Number(input.limit))) : 50;
  const timeline = timelineAll.slice(normalizedCursor, normalizedCursor + normalizedLimit);
  const nextCursor = normalizedCursor + timeline.length < totalTimelineCount ? normalizedCursor + timeline.length : null;
  return {
    historyVersion: '2026-02-14.v1',
    threadId: input.threadId,
    traceId: input.traceId,
    summary: {
      mode: String((input.state as any).mode || ''),
      winnerAgentId: merge ? String((merge as any).winnerAgentId || '') : null,
      overridden: merge ? Boolean((merge as any).overridden) : false,
      conflictReasons: merge && Array.isArray((merge as any).conflictReasons) ? (merge as any).conflictReasons : [],
      collaboration: merge ? (merge as any).collaboration || null : null,
      resultCount: results.length,
      successfulAgents: results.filter((row) => Boolean((row as any).ok)).map((row) => String((row as any).agentId || '')),
      totalOverrideCount: overrideHistory.length,
      totalTimelineCount,
    },
    page: {
      cursor: normalizedCursor,
      limit: normalizedLimit,
      nextCursor,
    },
    overrideHistory,
    timeline,
  };
}

function subscribeOrchestrationHistory(input: {
  threadId: string;
  traceId: string;
  res: Response;
  eventTypes: Set<string> | null;
  sinceAtMs: number | null;
  lastEventId: string | null;
}): { subscriber: HistorySubscriber; unsubscribe: () => void } {
  const key = orchestrationStateKey(input.threadId, input.traceId);
  const existing = orchestrationHistorySubscribers.get(key) || new Set<HistorySubscriber>();
  const subscriber: HistorySubscriber = {
    res: input.res,
    eventTypes: input.eventTypes,
    sinceAtMs: input.sinceAtMs,
    lastEventId: input.lastEventId,
  };
  existing.add(subscriber);
  orchestrationHistorySubscribers.set(key, existing);
  const unsubscribe = () => {
    const set = orchestrationHistorySubscribers.get(key);
    if (!set) return;
    set.delete(subscriber);
    if (set.size === 0) orchestrationHistorySubscribers.delete(key);
  };
  return { subscriber, unsubscribe };
}

function writeSseEvent(res: Response, event: string, data: Record<string, unknown>, id?: string): void {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function appendHistoryStreamEvent(key: string, event: HistoryStreamEvent): void {
  const list = orchestrationHistoryEventLog.get(key) || [];
  list.push(event);
  const trimmed = list.length > A2A_HISTORY_STREAM_BUFFER_SIZE ? list.slice(list.length - A2A_HISTORY_STREAM_BUFFER_SIZE) : list;
  orchestrationHistoryEventLog.set(key, trimmed);
}

function historyEventFromRedisRow(row: [string, string[]]): HistoryStreamEvent {
  const map = new Map<string, string>();
  const fields = row[1] || [];
  for (let i = 0; i < fields.length; i += 2) map.set(fields[i], fields[i + 1]);
  let detail: Record<string, unknown> | null = null;
  let history: Record<string, unknown> | null = null;
  try {
    detail = map.get('detail') ? (JSON.parse(map.get('detail') as string) as Record<string, unknown>) : null;
  } catch {
    detail = null;
  }
  try {
    history = map.get('history') ? (JSON.parse(map.get('history') as string) as Record<string, unknown>) : null;
  } catch {
    history = null;
  }
  return {
    id: row[0],
    at: map.get('at') || new Date().toISOString(),
    eventType: map.get('eventType') || 'unknown',
    threadId: map.get('threadId') || '',
    traceId: map.get('traceId') || '',
    detail,
    history,
  };
}

async function appendHistoryStreamEventRedis(input: { threadId: string; traceId: string; event: HistoryStreamEvent }): Promise<HistoryStreamEvent> {
  const redis = getRedisClient();
  if (!redis) return input.event;

  try {
    const key = resolveHistoryStreamKey(input.threadId, input.traceId);
    const streamId = await redis.xadd(
      key,
      'MAXLEN',
      '~',
      A2A_HISTORY_STREAM_BUFFER_SIZE,
      '*',
      'eventType',
      input.event.eventType,
      'at',
      input.event.at,
      'threadId',
      input.event.threadId,
      'traceId',
      input.event.traceId,
      'detail',
      JSON.stringify(input.event.detail || null),
      'history',
      JSON.stringify(input.event.history || null),
    );
    return { ...input.event, id: streamId || input.event.id };
  } catch {
    return input.event;
  }
}

async function readHistoryStreamEventsRedis(input: {
  threadId: string;
  traceId: string;
  afterId: string | null;
  count?: number;
}): Promise<HistoryStreamEvent[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const key = resolveHistoryStreamKey(input.threadId, input.traceId);
    const start = input.afterId ? `(${input.afterId}` : '-';
    const rows = await redis.xrange(key, start, '+', 'COUNT', Math.min(Math.max(input.count || 200, 1), 500));
    return rows.map((row) => historyEventFromRedisRow(row as [string, string[]]));
  } catch {
    return null;
  }
}

async function readHistoryStreamLatestIdRedis(input: { threadId: string; traceId: string }): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const key = resolveHistoryStreamKey(input.threadId, input.traceId);
    const rows = await redis.xrevrange(key, '+', '-', 'COUNT', 1);
    if (!rows || rows.length === 0) return null;
    return rows[0][0];
  } catch {
    return null;
  }
}

function shouldDeliverHistoryEvent(subscriber: HistorySubscriber, event: HistoryStreamEvent): boolean {
  if (subscriber.eventTypes && subscriber.eventTypes.size > 0 && !subscriber.eventTypes.has(event.eventType)) {
    return false;
  }
  if (subscriber.sinceAtMs !== null) {
    const eventAtMs = Date.parse(event.at);
    if (Number.isFinite(eventAtMs) && eventAtMs < subscriber.sinceAtMs) return false;
  }
  return true;
}

async function replayHistoryEvents(input: {
  key: string;
  threadId: string;
  traceId: string;
  subscriber: HistorySubscriber;
  lastEventId: string | null;
}): Promise<void> {
  const redisEvents = await readHistoryStreamEventsRedis({
    threadId: input.threadId,
    traceId: input.traceId,
    afterId: input.lastEventId,
    count: A2A_HISTORY_STREAM_BUFFER_SIZE,
  });
  const events = redisEvents ?? (orchestrationHistoryEventLog.get(input.key) || []);
  let startIdx = 0;
  if (!redisEvents && input.lastEventId) {
    const matchIdx = events.findIndex((event) => event.id === input.lastEventId);
    if (matchIdx >= 0) startIdx = matchIdx + 1;
  }
  const replay = events.slice(startIdx).filter((event) => shouldDeliverHistoryEvent(input.subscriber, event));
  for (const event of replay) {
    writeSseEvent(
      input.subscriber.res,
      'history_update',
      {
        eventType: event.eventType,
        at: event.at,
        threadId: event.threadId,
        traceId: event.traceId,
        detail: event.detail,
        history: event.history,
      },
      event.id,
    );
    input.subscriber.lastEventId = event.id;
  }
}

async function publishOrchestrationHistoryUpdate(input: {
  threadId: string;
  traceId: string;
  eventType: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const key = orchestrationStateKey(input.threadId, input.traceId);
  const eventId = `hist-${Date.now()}-${crypto.randomUUID().slice(0, 10)}`;
  const at = new Date().toISOString();
  const historyState = await getOrchestrationState({ threadId: input.threadId, traceId: input.traceId });
  const history = historyState
    ? buildOrchestrationHistoryPayload({
        threadId: input.threadId,
        traceId: input.traceId,
        state: historyState,
        cursor: 0,
        limit: 50,
      })
    : null;
  let event: HistoryStreamEvent = {
    id: eventId,
    at,
    eventType: input.eventType,
    threadId: input.threadId,
    traceId: input.traceId,
    detail: input.detail || null,
    history,
  };
  event = await appendHistoryStreamEventRedis({ threadId: input.threadId, traceId: input.traceId, event });
  appendHistoryStreamEvent(key, event);

  const subscribers = orchestrationHistorySubscribers.get(key);
  if (!subscribers || subscribers.size === 0) return;

  const stale: HistorySubscriber[] = [];
  for (const subscriber of subscribers) {
    if (!shouldDeliverHistoryEvent(subscriber, event)) continue;
    try {
      writeSseEvent(
        subscriber.res,
        'history_update',
        {
          eventType: event.eventType,
          at: event.at,
          threadId: event.threadId,
          traceId: event.traceId,
          detail: event.detail,
          history: event.history,
        },
        event.id,
      );
      subscriber.lastEventId = event.id;
    } catch {
      stale.push(subscriber);
    }
  }
  if (stale.length > 0) {
    for (const subscriber of stale) subscribers.delete(subscriber);
    if (subscribers.size === 0) orchestrationHistorySubscribers.delete(key);
  }
}

async function getBridgeHeartbeat(bridgeId: string): Promise<Record<string, unknown> | null> {
  const key = resolveBridgeHeartbeatKey(bridgeId);
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  const hit = bridgeHeartbeatStore.get(key);
  if (!hit) return null;
  return JSON.parse(hit.value) as Record<string, unknown>;
}

async function listBridgeHeartbeats(): Promise<Array<{ bridgeId: string; heartbeat: Record<string, unknown> }>> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:*`);
      if (keys.length > 0) {
        const rows = await redis.mget(keys);
        return keys
          .map((key, index) => {
            const raw = rows[index];
            if (!raw) return null;
            try {
              return {
                bridgeId: key.slice(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:`.length),
                heartbeat: JSON.parse(raw) as Record<string, unknown>,
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean) as Array<{ bridgeId: string; heartbeat: Record<string, unknown> }>;
      }
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  return Array.from(bridgeHeartbeatStore.entries()).map(([key, value]) => ({
    bridgeId: key.slice(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:`.length),
    heartbeat: JSON.parse(value.value) as Record<string, unknown>,
  }));
}

async function getBridgeQueueDepth(bridgeId: string): Promise<number> {
  const redis = getRedisClient();
  const key = resolveBridgeQueueKey(bridgeId);
  if (redis) {
    try {
      return Number(await redis.llen(key));
    } catch {
      // fall back
    }
  }
  return (bridgeJobQueueStore.get(bridgeId) || []).length;
}

async function storeBridgeSession(session: BridgeSession): Promise<void> {
  const redis = getRedisClient();
  const ttlMs = Math.max(1000, Date.parse(session.expiresAt) - Date.now());
  if (redis) {
    try {
      await redis.set(resolveBridgeSessionKey(session.token), JSON.stringify(session), 'PX', ttlMs);
      return;
    } catch {
      // fall back
    }
  }
  cleanBridgeState(Date.now());
  bridgeSessionStore.set(session.token, { expiresAt: Date.now() + ttlMs, value: JSON.stringify(session) });
}

async function getBridgeSession(token: string): Promise<BridgeSession | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(resolveBridgeSessionKey(token));
      if (!raw) return null;
      return JSON.parse(raw) as BridgeSession;
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  const hit = bridgeSessionStore.get(token);
  if (!hit) return null;
  return JSON.parse(hit.value) as BridgeSession;
}

async function listBridgeSessions(): Promise<BridgeSession[]> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`${BRIDGE_SESSION_KEY_PREFIX}:*`);
      if (keys.length > 0) {
        const rows = await redis.mget(keys);
        return rows
          .map((raw) => {
            if (!raw) return null;
            try {
              return JSON.parse(raw) as BridgeSession;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as BridgeSession[];
      }
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  return Array.from(bridgeSessionStore.values()).map((row) => JSON.parse(row.value) as BridgeSession);
}

async function emitAuditEvent(event: string, details: Record<string, unknown>): Promise<void> {
  const auditEvent: AuditEvent = {
    id: `audit-${Date.now()}-${crypto.randomUUID().slice(0, 10)}`,
    at: new Date().toISOString(),
    event,
    details,
  };

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.xadd(
        A2A_AUDIT_STREAM_KEY,
        '*',
        'event',
        auditEvent.event,
        'at',
        auditEvent.at,
        'details',
        JSON.stringify(auditEvent.details),
      );
      return;
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  auditStore.set(auditEvent.id, { expiresAt: Date.now() + A2A_AUDIT_TTL_MS, value: JSON.stringify(auditEvent) });
}

async function listAuditEvents(limit: number): Promise<AuditEvent[]> {
  const max = Math.min(Math.max(limit, 1), 200);
  const redis = getRedisClient();
  if (redis) {
    try {
      const rows = await redis.xrevrange(A2A_AUDIT_STREAM_KEY, '+', '-', 'COUNT', max);
      return rows.map((row) => {
        const fields = row[1] || [];
        const map = new Map<string, string>();
        for (let i = 0; i < fields.length; i += 2) map.set(fields[i], fields[i + 1]);
        let details: Record<string, unknown> = {};
        try {
          details = JSON.parse(map.get('details') || '{}') as Record<string, unknown>;
        } catch {
          details = {};
        }
        return {
          id: row[0],
          at: map.get('at') || new Date().toISOString(),
          event: map.get('event') || 'unknown',
          details,
        };
      });
    } catch {
      // fall back
    }
  }

  cleanBridgeState(Date.now());
  return Array.from(auditStore.values())
    .map((row) => JSON.parse(row.value) as AuditEvent)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, max);
}

async function validateOrchestrationPolicy(input: {
  envelope: RecoderA2AEnvelope;
  mode: OrchestrationMode;
  selectedTargets: string[];
}): Promise<{ ok: true; policy: OrchestrationPolicy } | { ok: false; status: number; error: string; policy?: OrchestrationPolicy }> {
  const policy = await getOrchestrationPolicy();
  const allowedIntents = new Set(policy.allowedIntents);
  if (!allowedIntents.has(String(input.envelope.intent))) {
    return { ok: false, status: 403, error: `Intent '${input.envelope.intent}' is not allowed by orchestrator policy` };
  }

  if (input.selectedTargets.length > policy.maxTargets) {
    return { ok: false, status: 400, error: `Too many selected targets (${input.selectedTargets.length})` };
  }

  const metadata = ((input.envelope as any)?.metadata || {}) as Record<string, unknown>;
  const deadlineMs = Number(metadata.deadlineMs || 0);
  if (Number.isFinite(deadlineMs) && deadlineMs > 0 && deadlineMs > policy.maxDeadlineMs) {
    return { ok: false, status: 400, error: `deadlineMs exceeds policy max (${policy.maxDeadlineMs})` };
  }

  const dualApprovalByMetadata = metadata.requireDualApproval === true || String(metadata.requireDualApproval || '') === 'true';
  const dualApprovalIntents = new Set(policy.requireDualApprovalIntents);
  if ((dualApprovalByMetadata || dualApprovalIntents.has(String(input.envelope.intent))) && input.selectedTargets.length < 2) {
    return { ok: false, status: 409, error: 'Dual approval policy requires at least 2 target agents' };
  }

  return { ok: true, policy };
}

function extractBearerToken(req: Request): string {
  const authHeader = String(req.header('authorization') || '');
  return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
}

async function verifyBridgeTokenForRequest(
  req: Request,
): Promise<{ ok: true; scope: string | null } | { ok: false; status: number; error: string }> {
  const basic = verifyBridgeToken(req);
  if (!basic.ok) return basic;

  const bearerToken = extractBearerToken(req);
  const staticToken = process.env.RECODER_A2A_BRIDGE_TOKEN || '';
  if (staticToken && bearerToken === staticToken) {
    const staticScope = String(process.env.RECODER_A2A_BRIDGE_TOKEN_SCOPE || '').trim() || null;
    return { ok: true, scope: staticScope };
  }

  const session = await getBridgeSession(bearerToken);
  if (!session) {
    return { ok: false, status: 401, error: 'Unauthorized bridge token' };
  }

  const bridgeId = String(req.header('x-recoder-a2a-bridge-id') || '').trim();
  if (bridgeId && session.bridgeId !== bridgeId) {
    return { ok: false, status: 403, error: 'Bridge token does not match bridge id' };
  }

  return { ok: true, scope: session.scope || null };
}

function newBridgeSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Extract an allowlist-validated platform from the bridge body, if present.
 *
 * Only returns a platform when the body explicitly supplies one that passes the
 * `VALID_RECORDER_PLATFORMS` allowlist. Returning `undefined` (rather than
 * coercing to `'custom'`) lets the registry preserve an existing agent's
 * platform on reconnect and apply its own first-pairing default, so a legit
 * external agent is never silently downgraded to `'custom'`.
 */
function extractValidatedPlatform(body: Record<string, unknown>): RecoderAgentPlatform | undefined {
  const raw = asString(body.platform).trim();
  if (!raw) return undefined;
  if (!VALID_RECORDER_PLATFORMS.has(raw)) return undefined;
  return raw as RecoderAgentPlatform;
}

/**
 * Reconcile a (re)connecting bridge/external agent against the durable agent
 * registry so it keeps a stable identity, accumulated workspace membership,
 * and live session health without creating duplicate registry entries.
 *
 * SECURITY: `callerIsAdmin` binds the trust level of the caller to the
 * reconcile. The untrusted bridge token (`/bridge/heartbeat`) passes `false`,
 * so it cannot claim an `agentId` that collides with a pre-registered default
 * agent (e.g. 'recoder-agency'); the admin-authenticated pairing path
 * (`/bridge/pair`) passes `true`. A reserved-id collision surfaces via
 * `ReservedAgentIdError` so callers can reject the request explicitly rather
 * than silently succeeding.
 *
 * No-op (returns null) when the payload carries no stable `agentId`.
 *
 * @throws {ReservedAgentIdError} when a non-admin caller claims a reserved id.
 */
function reconcileBridgeAgentSession(
  body: Record<string, unknown>,
  options: { callerIsAdmin: boolean },
): ReturnType<ReturnType<typeof getAgentRegistryService>['reconcileSession']> | null {
  const agentId = String(body.agentId || '').trim();
  if (!agentId) return null;

  const input: ReconcileSessionInput = {
    agentId,
    name: typeof body.name === 'string' ? body.name : undefined,
    // Allowlist-validated passthrough so legit external agents keep their real
    // platform instead of being silently dropped to 'custom'.
    platform: extractValidatedPlatform(body),
    url: typeof body.url === 'string' ? body.url : undefined,
    workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
    projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
    capabilities: asStringArray(body.capabilities),
    callerIsAdmin: options.callerIsAdmin,
  };

  try {
    return getAgentRegistryService().reconcileSession(input);
  } catch (error) {
    if (error instanceof ReservedAgentIdError) {
      // Propagate so the route can reject with 403 instead of silently
      // upserting a phantom agent under a reserved default id.
      throw error;
    }
    // Otherwise reconciliation is best-effort: a malformed agentId must not
    // break the bridge pairing / heartbeat acknowledgement path.
    return null;
  }
}

router.post('/bridge/jobs', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const bridgeId = String((parsedBody as any).bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || 'default').trim();
  const agentId = String((parsedBody as any).agentId || '').trim();
  const envelopeParse = parseEnvelopeFromUnknown((parsedBody as any).envelope, 'envelope');
  if (!agentId) {
    res.status(400).json({ ok: false, error: 'agentId is required' });
    return;
  }
  if (!envelopeParse.ok) {
    respondInvalidEnvelope(res, envelopeParse.issues);
    return;
  }
  const envelope = envelopeParse.envelope;
  const traceId = String((parsedBody as any).traceId || (envelope as any)?.metadata?.traceId || '').trim() || undefined;
  const effectiveScope = resolveEffectiveScope({ req, claimedScope: auth.scope });
  if (isScopeEnforced() && !effectiveScope.scope) {
    res.status(effectiveScope.status || 400).json({ ok: false, error: effectiveScope.error || 'Missing scope' });
    return;
  }

  const job: BridgeJob = {
    jobId: String((parsedBody as any).jobId || `bridge-${envelope.messageId}-${Date.now()}`),
    agentId,
    envelope,
    traceId,
    scope: effectiveScope.scope,
    enqueuedAt: new Date().toISOString(),
  };
  await enqueueBridgeJob({ bridgeId, job });
  await emitAuditEvent('bridge_job_enqueued', {
    bridgeId,
    agentId,
    jobId: job.jobId,
    scope: job.scope || null,
    messageId: envelope.messageId,
    threadId: envelope.threadId,
  });
  res.status(202).json({ ok: true, bridgeId, jobId: job.jobId });
});

router.post('/bridge/pair', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const bridgeId = String((parsedBody as any).bridgeId || '').trim();
  if (!bridgeId) {
    res.status(400).json({ ok: false, error: 'bridgeId is required' });
    return;
  }
  const requestedScopeRaw = String((parsedBody as any).scope || '').trim();
  const requestedScope = requestedScopeRaw || auth.scope || null;
  if (isScopeEnforced() && !requestedScope) {
    res.status(400).json({ ok: false, error: 'Scope claim is required for bridge session' });
    return;
  }

  const ttlMs = Number((parsedBody as any).ttlMs || BRIDGE_SESSION_TTL_MS);
  const boundedTtlMs = Math.min(Math.max(ttlMs, 60 * 1000), 7 * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const session: BridgeSession = {
    token: newBridgeSessionToken(),
    bridgeId,
    scope: requestedScope,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + boundedTtlMs).toISOString(),
    issuedBy: String((parsedBody as any).issuedBy || 'admin'),
  };
  await storeBridgeSession(session);

  // Reconnect-safe reconciliation: keep durable identity + workspace membership
  // for the paired agent without creating duplicate registry entries. This path
  // is admin-authenticated (verifyAdminToken above), so it may claim reserved
  // default agent ids.
  const reconciled = reconcileBridgeAgentSession(parsedBody as Record<string, unknown>, {
    callerIsAdmin: true,
  });
  if (reconciled) {
    await emitAuditEvent('bridge_agent_reconciled', {
      bridgeId: session.bridgeId,
      agentId: reconciled.durable.agentId,
      isNew: reconciled.isNew,
      reconnectCount: reconciled.durable.reconnectCount,
      workspaceIds: reconciled.durable.workspaceIds,
    });
  }

  res.status(201).json({
    ok: true,
    bridgeId: session.bridgeId,
    token: session.token,
    scope: session.scope || null,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    agent: reconciled
      ? {
          agentId: reconciled.durable.agentId,
          isNew: reconciled.isNew,
          firstSeenAt: reconciled.durable.firstSeenAt,
          reconnectCount: reconciled.durable.reconnectCount,
          workspaceIds: reconciled.durable.workspaceIds,
          online: reconciled.health.online,
        }
      : null,
  });
});

router.get('/bridge/sessions', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const sessions = await listBridgeSessions();
  res.status(200).json({
    ok: true,
    sessions: sessions.map((session) => ({
      bridgeId: session.bridgeId,
      scope: session.scope || null,
      issuedBy: session.issuedBy,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      tokenPreview: `${session.token.slice(0, 8)}...`,
    })),
  });
});

router.get('/bridge/jobs/next', async (req: Request, res: Response) => {
  const auth = await verifyBridgeTokenForRequest(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const bridgeId = String(req.header('x-recoder-a2a-bridge-id') || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || 'default').trim();
  const job = await dequeueBridgeJob(bridgeId, auth.scope || null);
  if (!job) {
    res.status(204).end();
    return;
  }
  await emitAuditEvent('bridge_job_dequeued', {
    bridgeId,
    jobId: job.jobId,
    agentId: job.agentId,
    scope: job.scope || null,
    threadId: job.envelope.threadId,
  });
  res.status(200).json(job);
});

router.post('/bridge/jobs/:jobId/result', async (req: Request, res: Response) => {
  const auth = await verifyBridgeTokenForRequest(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const jobId = String(req.params.jobId || '').trim();
  if (!jobId) {
    res.status(400).json({ ok: false, error: 'jobId is required' });
    return;
  }
  const dedupe = await checkAndStoreBridgeResultIdempotency(jobId);
  if (!dedupe.accepted) {
    res.status(400).json({ ok: false, error: 'jobId is required' });
    return;
  }
  if (dedupe.duplicate) {
    await emitAuditEvent('bridge_result_duplicate', { jobId });
    res.status(202).json({ ok: true, duplicate: true, jobId });
    return;
  }

  await storeBridgeResult({
    jobId,
    result: parsedBody as Record<string, unknown>,
  });

  let resultEnvelope: GatewayEnvelope | undefined;
  if ((parsedBody as any).resultEnvelope !== undefined) {
    const parsedResultEnvelope = parseEnvelopeFromUnknown((parsedBody as any).resultEnvelope, 'resultEnvelope');
    if (!parsedResultEnvelope.ok) {
      respondInvalidEnvelope(res, parsedResultEnvelope.issues, 'Invalid bridge result envelope');
      return;
    }
    resultEnvelope = parsedResultEnvelope.envelope;
  }
  if (resultEnvelope?.messageId && resultEnvelope.threadId) {
    await dispatchIntentToBackend(resultEnvelope);
  }
  await emitAuditEvent('bridge_result_accepted', {
    jobId,
    ok: Boolean((parsedBody as any).ok),
    resultMessageId: resultEnvelope?.messageId || null,
    resultThreadId: resultEnvelope?.threadId || null,
  });

  res.status(200).json({ ok: true, jobId });
});

router.get('/bridge/jobs/:jobId/result', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const jobId = String(req.params.jobId || '').trim();
  if (!jobId) {
    res.status(400).json({ ok: false, error: 'jobId is required' });
    return;
  }

  const result = await getBridgeResult(jobId);
  if (!result) {
    res.status(404).json({ ok: false, error: 'Result not found', jobId });
    return;
  }

  res.status(200).json({ ok: true, jobId, result });
});

router.post('/bridge/heartbeat', async (req: Request, res: Response) => {
  const auth = await verifyBridgeTokenForRequest(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const bridgeId = String(req.header('x-recoder-a2a-bridge-id') || (parsedBody as any).bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || 'default').trim();
  await storeBridgeHeartbeat({ bridgeId, payload: parsedBody as Record<string, unknown> });

  // Refresh durable identity last-seen / health and capabilities on heartbeat
  // for any agent that identifies itself, reusing its existing registry entry.
  // This path is authenticated only with a bridge token (non-admin), so it must
  // NOT be allowed to claim a reserved default agent id — reject with 403 if it
  // tries, instead of upserting a phantom/shadow agent.
  let reconciled: ReturnType<typeof reconcileBridgeAgentSession>;
  try {
    reconciled = reconcileBridgeAgentSession(parsedBody as Record<string, unknown>, {
      callerIsAdmin: false,
    });
  } catch (error) {
    if (error instanceof ReservedAgentIdError) {
      res.status(403).json({ ok: false, error: error.message });
      return;
    }
    throw error;
  }

  await emitAuditEvent('bridge_heartbeat', {
    bridgeId,
    capabilities: (parsedBody as any).capabilities || null,
    agentId: reconciled?.durable.agentId || null,
  });
  res.status(200).json({
    ok: true,
    bridgeId,
    agent: reconciled
      ? { agentId: reconciled.durable.agentId, online: reconciled.health.online }
      : null,
  });
});

router.get('/bridge/heartbeats', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const heartbeats = await listBridgeHeartbeats();
  res.status(200).json({ ok: true, heartbeats });
});

router.get('/bridge/heartbeats/:bridgeId', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const bridgeId = String(req.params.bridgeId || '').trim();
  if (!bridgeId) {
    res.status(400).json({ ok: false, error: 'bridgeId is required' });
    return;
  }

  const heartbeat = await getBridgeHeartbeat(bridgeId);
  if (!heartbeat) {
    res.status(404).json({ ok: false, error: 'Heartbeat not found', bridgeId });
    return;
  }

  res.status(200).json({ ok: true, bridgeId, heartbeat });
});

router.get('/bridge/status', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const rows = await listBridgeHeartbeats();
  const statuses: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const queueDepth = await getBridgeQueueDepth(row.bridgeId);
    statuses.push({
      bridgeId: row.bridgeId,
      queueDepth,
      heartbeat: row.heartbeat,
    });
  }
  res.status(200).json({ ok: true, bridges: statuses });
});

router.get('/audit', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const limit = Number(String(req.query.limit || '50'));
  const events = await listAuditEvents(Number.isFinite(limit) ? limit : 50);
  res.status(200).json({ ok: true, events });
});

router.get('/agents', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const existing = await listAgentRegistry();
  if (existing.length === 0) {
    for (const entry of builtinAgentEntries()) {
      await upsertAgentRegistryEntry(entry);
    }
  }

  res.status(200).json({ ok: true, agents: await listAgentRegistry() });
});

router.put('/agents/:agentId', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const agentId = String(req.params.agentId || '').trim();
  if (!agentId) {
    res.status(400).json({ ok: false, error: 'agentId is required' });
    return;
  }

  const existing = (await getAgentRegistryEntry(agentId)) || {
    agent_id: agentId,
    platform: String((parsedBody as any).platform || agentId),
    base_url: '',
    enabled: false,
    auth_mode: 'hmac_shared_secret' as AgentAuthMode,
    health: 'unknown' as AgentHealth,
    updated_at: new Date().toISOString(),
  };

  const next: AgentRegistryEntry = {
    ...existing,
    platform: String((parsedBody as any).platform || existing.platform || agentId),
    base_url: String((parsedBody as any).base_url ?? existing.base_url ?? ''),
    enabled: asBool((parsedBody as any).enabled, existing.enabled),
    auth_mode: ((parsedBody as any).auth_mode === 'none' ? 'none' : 'hmac_shared_secret') as AgentAuthMode,
    health: (['unknown', 'healthy', 'unhealthy'].includes(String((parsedBody as any).health || ''))
      ? String((parsedBody as any).health)
      : existing.health) as AgentHealth,
    updated_at: new Date().toISOString(),
  };

  await upsertAgentRegistryEntry(next);
  res.status(200).json({ ok: true, agent: next });
});

router.post('/agents/test', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const agentId = String((parsedBody as any).agent_id || '').trim();
  const agent = await getAgentRegistryEntry(agentId);
  if (!agent) {
    res.status(404).json({ ok: false, error: 'Agent not found' });
    return;
  }
  if (!agent.base_url) {
    res.status(400).json({ ok: false, error: 'Agent base_url is not configured' });
    return;
  }

  const healthUrl = `${agent.base_url.replace(/\/$/, '')}/.well-known/agent-card.json`;
  try {
    const response = await fetch(healthUrl, { method: 'GET' });
    const next: AgentRegistryEntry = { ...agent, health: response.ok ? 'healthy' : 'unhealthy', updated_at: new Date().toISOString() };
    await upsertAgentRegistryEntry(next);
    res.status(200).json({ ok: response.ok, agent: next, status: response.status, healthUrl });
  } catch (error) {
    const next: AgentRegistryEntry = { ...agent, health: 'unhealthy', updated_at: new Date().toISOString() };
    await upsertAgentRegistryEntry(next);
    res.status(502).json({ ok: false, agent: next, error: 'health_check_failed' });
  }
});

router.get('/policy', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const policy = await getOrchestrationPolicy();
  res.status(200).json({ ok: true, policy });
});

router.put('/policy', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const current = await getOrchestrationPolicy();
  const allowedIntentsInput = Array.isArray((parsedBody as any).allowedIntents)
    ? (parsedBody as any).allowedIntents
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean)
    : current.allowedIntents;
  const dualApprovalIntentsInput = Array.isArray((parsedBody as any).requireDualApprovalIntents)
    ? (parsedBody as any).requireDualApprovalIntents
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean)
    : current.requireDualApprovalIntents;
  const maxTargetsInput = Number((parsedBody as any).maxTargets ?? current.maxTargets);
  const maxDeadlineInput = Number((parsedBody as any).maxDeadlineMs ?? current.maxDeadlineMs);

  const next: OrchestrationPolicy = {
    allowedIntents: allowedIntentsInput.length > 0 ? allowedIntentsInput : current.allowedIntents,
    requireDualApprovalIntents: dualApprovalIntentsInput,
    maxTargets: Number.isFinite(maxTargetsInput) ? Math.min(Math.max(maxTargetsInput, 1), 5) : current.maxTargets,
    maxDeadlineMs: Number.isFinite(maxDeadlineInput)
      ? Math.min(Math.max(maxDeadlineInput, 1000), 24 * 60 * 60 * 1000)
      : current.maxDeadlineMs,
    updatedAt: new Date().toISOString(),
  };
  await upsertOrchestrationPolicy(next);
  await emitAuditEvent('orchestration_policy_updated', {
    updatedAt: next.updatedAt,
    maxTargets: next.maxTargets,
    maxDeadlineMs: next.maxDeadlineMs,
    allowedIntents: next.allowedIntents,
    requireDualApprovalIntents: next.requireDualApprovalIntents,
  });
  res.status(200).json({ ok: true, policy: next });
});

router.post('/orchestrate', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const envelopeParse = parseEnvelopeFromUnknown((parsedBody as any).envelope, 'envelope');
  if (!envelopeParse.ok) {
    respondInvalidEnvelope(res, envelopeParse.issues);
    return;
  }
  const envelope = envelopeParse.envelope;
  const effectiveScope = resolveEffectiveScope({ req, claimedScope: auth.scope });
  if (isScopeEnforced() && !effectiveScope.scope) {
    res
      .status(effectiveScope.status || 400)
      .json({ ok: false, error: effectiveScope.error || 'Token scope claim is required' });
    return;
  }

  const mode = normalizeMode((parsedBody as any).mode || (envelope as any)?.metadata?.executionMode);
  const primaryAgent = String((parsedBody as any).primaryAgent || '');
  const fallbackAgent = String((parsedBody as any).fallbackAgent || '');
  const codex = await getAgentRegistryEntry('codex');
  const claude = await getAgentRegistryEntry('claude_code');
  const selected = selectTargets({ mode, codex, claude, primaryAgent, fallbackAgent });
  if (selected.length === 0) {
    await emitAuditEvent('orchestrate_rejected', {
      reason: 'no_available_agents',
      mode,
      messageId: envelope.messageId,
      threadId: envelope.threadId,
    });
    res.status(409).json({ ok: false, error: 'No available agents for requested mode', mode });
    return;
  }
  const policy = await validateOrchestrationPolicy({ envelope, mode, selectedTargets: selected });
  if (!policy.ok) {
    await emitAuditEvent('orchestrate_rejected', {
      reason: 'policy',
      policyError: policy.error,
      mode,
      intent: envelope.intent,
      messageId: envelope.messageId,
      threadId: envelope.threadId,
    });
    res.status(policy.status).json({ ok: false, error: policy.error, mode });
    return;
  }

  const endpointByAgent: Record<string, string> = {
    codex: codex?.base_url || '',
    claude_code: claude?.base_url || '',
  };
  const bridgeIdFromRequest = String((parsedBody as any).bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || '').trim();
  const bridgeEnabled = Boolean(bridgeIdFromRequest) || process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK === 'true';
  const bridgeId = bridgeIdFromRequest || 'default';

  const traceId =
    String((envelope as any)?.metadata?.traceId || '') ||
    String((parsedBody as any).traceId || '') ||
    `trace-${envelope.messageId}`;
  const results: Record<string, unknown>[] = [];

  for (const agentId of selected) {
    const startedAt = Date.now();
    const baseUrl = endpointByAgent[agentId];
    if (baseUrl.startsWith('bridge://')) {
      const routedBridgeId = baseUrl.slice('bridge://'.length).trim() || bridgeId;
      const bridgeJob: BridgeJob = {
        jobId: `bridge-${envelope.messageId}-${agentId}-${Date.now()}`,
        agentId,
        envelope,
        traceId,
        scope: effectiveScope.scope,
        enqueuedAt: new Date().toISOString(),
      };
      await enqueueBridgeJob({ bridgeId: routedBridgeId, job: bridgeJob });
      const completedAt = Date.now();
      results.push({
        agentId,
        ok: true,
        status: 202,
        queued: true,
        channel: 'bridge',
        bridgeId: routedBridgeId,
        jobId: bridgeJob.jobId,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
      });
      if (mode === 'fallback' || mode === 'codex_only' || mode === 'claude_only') break;
      continue;
    }

    if (!baseUrl) {
      if (bridgeEnabled && (agentId === 'codex' || agentId === 'claude_code')) {
        const bridgeJob: BridgeJob = {
          jobId: `bridge-${envelope.messageId}-${agentId}-${Date.now()}`,
          agentId,
          envelope,
          traceId,
          scope: effectiveScope.scope,
          enqueuedAt: new Date().toISOString(),
        };
        await enqueueBridgeJob({ bridgeId, job: bridgeJob });
        const completedAt = Date.now();
        results.push({
          agentId,
          ok: true,
          status: 202,
          queued: true,
          channel: 'bridge',
          bridgeId,
          jobId: bridgeJob.jobId,
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date(completedAt).toISOString(),
          durationMs: completedAt - startedAt,
        });
        if (mode === 'fallback' || mode === 'codex_only' || mode === 'claude_only') break;
        continue;
      }

      const completedAt = Date.now();
      results.push({
        agentId,
        ok: false,
        status: 400,
        error: 'missing_base_url',
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
      });
      if (mode === 'fallback') continue;
      if (mode !== 'parallel') break;
      continue;
    }

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/a2a/envelope`;
    try {
      const result = await dispatchSignedEnvelope({
        targetUrl,
        envelope,
        senderAgent: process.env.RECODER_A2A_AGENT_ID || 'docker-backend',
      });
      const completedAt = Date.now();
      results.push({
        agentId,
        ...result,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
      });
      if (mode === 'fallback' && result.ok) break;
      if (mode === 'codex_only' || mode === 'claude_only') break;
    } catch (error) {
      const completedAt = Date.now();
      results.push({
        agentId,
        ok: false,
        status: 502,
        error: 'dispatch_failed',
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
      });
      if (mode !== 'parallel') continue;
    }
  }
  const merge = computeDeterministicMerge({ mode, results, primaryAgent });

  await persistOrchestrationState({
    threadId: envelope.threadId,
    traceId,
    mode,
    targets: selected,
    results,
    merge,
    overrideHistory: [],
    scope: effectiveScope.scope,
  });

  const anySuccess = results.some((row) => Boolean((row as any).ok));
  await emitAuditEvent('orchestrate_completed', {
    mode,
    messageId: envelope.messageId,
    threadId: envelope.threadId,
    traceId,
    selected,
    success: anySuccess,
    mergeWinner: merge ? (merge as any).winnerAgentId : null,
  });
  await publishOrchestrationHistoryUpdate({
    threadId: envelope.threadId,
    traceId,
    eventType: 'orchestration_completed',
    detail: {
      mode,
      selected,
      mergeWinner: merge ? (merge as any).winnerAgentId : null,
      success: anySuccess,
    },
  });
  res.status(anySuccess ? 202 : 502).json({
    ok: anySuccess,
    mode,
    threadId: envelope.threadId,
    traceId,
    policy: policy.policy,
    selected,
    results,
    merge,
  });
});

router.get('/orchestrate/:threadId/:traceId', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const threadId = String(req.params.threadId || '').trim();
  const traceId = String(req.params.traceId || '').trim();
  if (!threadId || !traceId) {
    res.status(400).json({ ok: false, error: 'threadId and traceId are required' });
    return;
  }

  const state = await getOrchestrationState({ threadId, traceId });
  if (!state) {
    res.status(404).json({ ok: false, error: 'Orchestration state not found', threadId, traceId });
    return;
  }
  const scopeAccess = verifyScopeAccess({ req, state, claimedScope: auth.scope });
  if (!scopeAccess.ok) {
    res.status(scopeAccess.status).json({ ok: false, error: scopeAccess.error });
    return;
  }

  res.status(200).json({ ok: true, threadId, traceId, state });
});

router.get('/orchestrate/:threadId/:traceId/history', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const threadId = String(req.params.threadId || '').trim();
  const traceId = String(req.params.traceId || '').trim();
  if (!threadId || !traceId) {
    res.status(400).json({ ok: false, error: 'threadId and traceId are required' });
    return;
  }

  const state = await getOrchestrationState({ threadId, traceId });
  if (!state) {
    res.status(404).json({ ok: false, error: 'Orchestration state not found', threadId, traceId });
    return;
  }
  const scopeAccess = verifyScopeAccess({ req, state, claimedScope: auth.scope });
  if (!scopeAccess.ok) {
    res.status(scopeAccess.status).json({ ok: false, error: scopeAccess.error });
    return;
  }

  const history = buildOrchestrationHistoryPayload({
    threadId,
    traceId,
    state,
    cursor: Number(String(req.query.cursor || '0')),
    limit: Number(String(req.query.limit || '50')),
  });
  res.status(200).json({ ok: true, ...history });
});

router.get('/orchestrate/:threadId/:traceId/history/stream', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const threadId = String(req.params.threadId || '').trim();
  const traceId = String(req.params.traceId || '').trim();
  if (!threadId || !traceId) {
    res.status(400).json({ ok: false, error: 'threadId and traceId are required' });
    return;
  }
  const stateForScope = await getOrchestrationState({ threadId, traceId });
  if (stateForScope) {
    const scopeAccess = verifyScopeAccess({ req, state: stateForScope, claimedScope: auth.scope });
    if (!scopeAccess.ok) {
      res.status(scopeAccess.status).json({ ok: false, error: scopeAccess.error });
      return;
    }
  } else if (isScopeEnforced()) {
    const effectiveScope = resolveEffectiveScope({ req, claimedScope: auth.scope });
    if (!effectiveScope.scope) {
      res.status(effectiveScope.status || 400).json({ ok: false, error: effectiveScope.error || 'Missing scope' });
      return;
    }
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  const eventTypesRaw = String(req.query.eventTypes || '').trim();
  const eventTypes = eventTypesRaw
    ? new Set(
        eventTypesRaw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null;
  const sinceAtRaw = String(req.query.sinceAt || '').trim();
  const sinceAtMsParsed = sinceAtRaw ? Date.parse(sinceAtRaw) : NaN;
  const sinceAtMs = Number.isFinite(sinceAtMsParsed) ? sinceAtMsParsed : null;
  const lastEventIdHeader = String(req.header('last-event-id') || '').trim();
  const lastEventIdQuery = String(req.query.lastEventId || '').trim();
  const lastEventId = lastEventIdHeader || lastEventIdQuery || null;

  const { subscriber, unsubscribe } = subscribeOrchestrationHistory({
    threadId,
    traceId,
    res,
    eventTypes,
    sinceAtMs,
    lastEventId,
  });
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      // closed by client
    }
  }, 15000);

  const state = await getOrchestrationState({ threadId, traceId });
  const initialPayload = {
    eventType: 'snapshot',
    at: new Date().toISOString(),
    threadId,
    traceId,
    filters: {
      eventTypes: eventTypes ? Array.from(eventTypes) : null,
      sinceAt: sinceAtRaw || null,
      lastEventId,
    },
    history: state
      ? buildOrchestrationHistoryPayload({
          threadId,
          traceId,
          state,
          cursor: 0,
          limit: 50,
        })
      : null,
  };
  writeSseEvent(res, 'history_snapshot', initialPayload);
  await replayHistoryEvents({
    key: orchestrationStateKey(threadId, traceId),
    threadId,
    traceId,
    subscriber,
    lastEventId,
  });

  if (!subscriber.lastEventId) {
    subscriber.lastEventId =
      (await readHistoryStreamLatestIdRedis({ threadId, traceId })) ||
      (() => {
        const events = orchestrationHistoryEventLog.get(orchestrationStateKey(threadId, traceId)) || [];
        return events.length > 0 ? events[events.length - 1].id : null;
      })();
  }

  const replayPoll = setInterval(async () => {
    const redisEvents = await readHistoryStreamEventsRedis({
      threadId,
      traceId,
      afterId: subscriber.lastEventId,
      count: 100,
    });
    if (!redisEvents || redisEvents.length === 0) return;
    for (const event of redisEvents) {
      if (!shouldDeliverHistoryEvent(subscriber, event)) {
        subscriber.lastEventId = event.id;
        continue;
      }
      try {
        writeSseEvent(
          res,
          'history_update',
          {
            eventType: event.eventType,
            at: event.at,
            threadId: event.threadId,
            traceId: event.traceId,
            detail: event.detail,
            history: event.history,
          },
          event.id,
        );
        subscriber.lastEventId = event.id;
      } catch {
        break;
      }
    }
  }, A2A_HISTORY_STREAM_POLL_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(replayPoll);
    unsubscribe();
  });
});

router.post('/orchestrate/:threadId/:traceId/override', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const threadId = String(req.params.threadId || '').trim();
  const traceId = String(req.params.traceId || '').trim();
  if (!threadId || !traceId) {
    res.status(400).json({ ok: false, error: 'threadId and traceId are required' });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const winnerAgentId = String((parsedBody as any).winnerAgentId || '').trim();
  const overrideReason = String((parsedBody as any).reason || '').trim();
  const overrideBy = String((parsedBody as any).overrideBy || 'admin').trim();
  if (!winnerAgentId) {
    res.status(400).json({ ok: false, error: 'winnerAgentId is required' });
    return;
  }

  const state = await getOrchestrationState({ threadId, traceId });
  if (!state) {
    res.status(404).json({ ok: false, error: 'Orchestration state not found', threadId, traceId });
    return;
  }
  const scopeAccess = verifyScopeAccess({ req, state, claimedScope: auth.scope });
  if (!scopeAccess.ok) {
    res.status(scopeAccess.status).json({ ok: false, error: scopeAccess.error });
    return;
  }

  const merge = ((state as any).merge || null) as Record<string, unknown> | null;
  if (!merge) {
    res.status(409).json({ ok: false, error: 'No merge decision exists for this orchestration' });
    return;
  }

  const candidates = Array.isArray((merge as any).candidates) ? ((merge as any).candidates as Array<Record<string, unknown>>) : [];
  const winnerCandidate = candidates.find((candidate) => String(candidate.agentId || '') === winnerAgentId);
  if (!winnerCandidate) {
    res.status(400).json({ ok: false, error: `winnerAgentId '${winnerAgentId}' is not in merge candidates` });
    return;
  }

  const mergedConflictReasons = Array.isArray((merge as any).conflictReasons)
    ? ([...(merge as any).conflictReasons, 'manual_override'] as string[])
    : ['manual_override'];
  const previousWinnerAgentId = (() => {
    const current = (merge as any).winnerAgentId;
    if (current === null || current === undefined || current === '') return null;
    return String(current);
  })();
  const overrideAt = new Date().toISOString();
  const nextMerge = {
    ...merge,
    winnerAgentId,
    winnerScore: Number(winnerCandidate.score || 0),
    winnerReason: `manual_override:${overrideReason || 'operator_override'}`,
    conflictReasons: Array.from(new Set(mergedConflictReasons)),
    overridden: true,
    override: {
      reason: overrideReason || 'operator_override',
      by: overrideBy,
      at: overrideAt,
    },
  };
  const overrideHistory = extractOverrideHistoryFromState(state as Record<string, unknown>);
  const nextOverrideHistory: OverrideHistoryEntry[] = overrideHistory.concat({
    at: overrideAt,
    by: overrideBy,
    winnerAgentId,
    previousWinnerAgentId,
    reason: overrideReason || 'operator_override',
  });

  await upsertOrchestrationStateRecord({
    threadId,
    traceId,
    state: {
      ...(state as Record<string, unknown>),
      merge: nextMerge,
      overrideHistory: nextOverrideHistory,
    },
  });

  await emitAuditEvent('orchestrate_merge_overridden', {
    threadId,
    traceId,
    winnerAgentId,
    overrideBy,
    overrideReason: overrideReason || 'operator_override',
  });
  await publishOrchestrationHistoryUpdate({
    threadId,
    traceId,
    eventType: 'merge_overridden',
    detail: {
      winnerAgentId,
      overrideBy,
      overrideReason: overrideReason || 'operator_override',
    },
  });

  res.status(200).json({
    ok: true,
    threadId,
    traceId,
    merge: nextMerge,
    overrideHistory: nextOverrideHistory,
  });
});

router.post('/orchestrate/:threadId/:traceId/recompute', async (req: Request, res: Response) => {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const threadId = String(req.params.threadId || '').trim();
  const traceId = String(req.params.traceId || '').trim();
  if (!threadId || !traceId) {
    res.status(400).json({ ok: false, error: 'threadId and traceId are required' });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (parsedBody !== null && typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const state = await getOrchestrationState({ threadId, traceId });
  if (!state) {
    res.status(404).json({ ok: false, error: 'Orchestration state not found', threadId, traceId });
    return;
  }
  const scopeAccess = verifyScopeAccess({ req, state, claimedScope: auth.scope });
  if (!scopeAccess.ok) {
    res.status(scopeAccess.status).json({ ok: false, error: scopeAccess.error });
    return;
  }

  const mode = normalizeMode((state as any).mode || 'parallel');
  const primaryAgent = String(((parsedBody as any)?.primaryAgent ?? (state as any)?.primaryAgent ?? '') || '');
  const results = extractResultsFromState(state);
  const overrideHistory = extractOverrideHistoryFromState(state as Record<string, unknown>);
  const recomputed = computeDeterministicMerge({ mode, results, primaryAgent });
  if (!recomputed) {
    res.status(409).json({ ok: false, error: 'Unable to recompute merge for this orchestration mode/results' });
    return;
  }

  await upsertOrchestrationStateRecord({
    threadId,
    traceId,
    state: {
      ...(state as Record<string, unknown>),
      merge: recomputed,
      primaryAgent,
    },
  });

  await emitAuditEvent('orchestrate_merge_recomputed', {
    threadId,
    traceId,
    mode,
    primaryAgent: primaryAgent || null,
    winnerAgentId: (recomputed as any).winnerAgentId || null,
  });
  await publishOrchestrationHistoryUpdate({
    threadId,
    traceId,
    eventType: 'merge_recomputed',
    detail: {
      winnerAgentId: (recomputed as any).winnerAgentId || null,
      primaryAgent: primaryAgent || null,
    },
  });

  res.status(200).json({
    ok: true,
    threadId,
    traceId,
    merge: recomputed,
    overrideHistory,
  });
});

router.post('/intents/:intent', async (req: Request, res: Response) => {
  const allowedIntents = new Set(['plan', 'execute', 'review', 'handoff', 'tool_call']);
  const intent = String(req.params.intent || '').trim();
  if (!allowedIntents.has(intent)) {
    res.status(400).json({ ok: false, error: 'Unsupported intent' });
    return;
  }

  const workerAuth = verifyWorkerTokenHeader(req);
  if (!workerAuth.ok) {
    res.status(workerAuth.status).json({ ok: false, error: workerAuth.error });
    return;
  }

  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const bodyIntent = String((parsedBody as any).intent || '');
  if (bodyIntent && bodyIntent !== intent) {
    res.status(400).json({ ok: false, error: 'Intent mismatch between path and body' });
    return;
  }

  const envelope = ((parsedBody as any).envelope || {}) as { messageId?: string; threadId?: string };
  const executorUrl = resolveIntentExecutor(intent);
  let executor: Record<string, unknown> = { executed: false, reason: 'no_executor_configured' };
  if (executorUrl) {
    try {
      const response = await fetch(executorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, source: 'a2a-intent-handler', payload: parsedBody }),
      });
      executor = { executed: response.ok, status: response.status, url: executorUrl };
    } catch (error) {
      executor = { executed: false, error: String((error as Error)?.message || 'executor_failed'), url: executorUrl };
    }
  }

  res.status(202).json({
    ok: true,
    intent,
    service: 'docker-backend',
    acceptedAt: new Date().toISOString(),
    job: {
      messageId: String(envelope.messageId || ''),
      threadId: String(envelope.threadId || ''),
    },
    executor,
  });
});

router.post('/envelope', async (req: Request, res: Response) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const verification = await verifyIncomingRequest({
    headers: {
      'x-recoder-a2a-agent-id': req.header('x-recoder-a2a-agent-id') || undefined,
      'x-recoder-a2a-timestamp': req.header('x-recoder-a2a-timestamp') || undefined,
      'x-recoder-a2a-signature': req.header('x-recoder-a2a-signature') || undefined,
    },
    rawBody,
  });
  if (!verification.ok) {
    res.status(verification.status).json({ ok: false, error: verification.error });
    return;
  }

  let envelope: GatewayEnvelope;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    const parsedEnvelope = parseEnvelopeFromUnknown(parsed, 'body');
    if (!parsedEnvelope.ok) {
      respondInvalidEnvelope(res, parsedEnvelope.issues);
      return;
    }
    envelope = parsedEnvelope.envelope;
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const idempotency = await checkAndStoreEnvelopeIdempotency(envelope);
  if (!idempotency.accepted) {
    res.status(400).json({ ok: false, error: 'messageId is required' });
    return;
  }

  const intent = await handleA2AIntent(envelope);
  res.status(idempotency.duplicate ? 202 : 200).json({
    ok: true,
    duplicate: idempotency.duplicate,
    messageId: envelope.messageId,
    threadId: envelope.threadId,
    intent: envelope.intent,
    intentResult: intent,
  });
});

router.post('/dispatch', async (req: Request, res: Response) => {
  const parsedBody =
    typeof req.body === 'string'
      ? (() => {
          try {
            return JSON.parse(req.body);
          } catch {
            return null;
          }
        })()
      : req.body;
  if (!parsedBody || typeof parsedBody !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    return;
  }

  const targetUrl = String((parsedBody as any).targetUrl || '').trim();
  if (!targetUrl) {
    res.status(400).json({ ok: false, error: 'targetUrl is required' });
    return;
  }

  const envelopeParse = parseEnvelopeFromUnknown((parsedBody as any).envelope, 'envelope');
  if (!envelopeParse.ok) {
    respondInvalidEnvelope(res, envelopeParse.issues);
    return;
  }
  const envelope = envelopeParse.envelope;

  if (!isAllowedTarget(targetUrl)) {
    res.status(403).json({ ok: false, error: 'targetUrl not in egress allowlist' });
    return;
  }

  const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
  if (!secret) {
    res.status(503).json({ ok: false, error: 'RECODER_A2A_SHARED_SECRET is not configured' });
    return;
  }

  const rawBody = JSON.stringify(envelope);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const digest = await hmacHex(secret, `${timestamp}.${rawBody}`);
  const senderAgent = process.env.RECODER_A2A_AGENT_ID || 'docker-backend';

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-recoder-a2a-agent-id': senderAgent,
      'x-recoder-a2a-timestamp': timestamp,
      'x-recoder-a2a-signature': `v1=${digest}`,
    },
    body: rawBody,
  });

  const responseBody = await response.text();
  res.status(response.ok ? 200 : 502).json({
    ok: response.ok,
    status: response.status,
    targetUrl,
    responseBody,
  });
});

export function getDockerBackendAgentCard(baseUrl: string) {
  return {
    name: 'Recoder Docker Backend Agent',
    description: 'Execution sandbox and backend operations agent',
    protocolVersion: '0.3.0',
    version: '1.0.0',
    url: `${baseUrl}/api/a2a/envelope`,
    skills: [
      { id: 'sandbox', name: 'Sandbox Runtime', description: 'Containerized execution', tags: ['execute', 'sandbox'] },
      { id: 'artifacts', name: 'Artifact Ops', description: 'File and artifact operations', tags: ['artifact', 'storage'] },
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
  agentRegistryStore.clear();
  orchestrationPolicyStore = null;
  orchestrationStore.clear();
  auditStore.clear();
  bridgeJobQueueStore.clear();
  bridgeResultStore.clear();
  bridgeResultAckStore.clear();
  bridgeHeartbeatStore.clear();
  bridgeSessionStore.clear();
  orchestrationHistorySubscribers.clear();
  orchestrationHistoryEventLog.clear();
}

export const __testSelectTargets = selectTargets;

export { router as a2aRouter };
