import {
  A2AControlPlane,
  InMemoryAgentRegistry,
  InMemoryAuditLogService,
  InMemoryCollaborationService,
  InMemoryTaskStore,
  PersistentAuditLogService,
  PersistentCollaborationService,
  PersistentTaskStore,
  RedisBackedPersistenceAdapter,
  UnifiedPolicyPlane,
  buildInvalidA2AEnvelopeErrorResponse,
  createRecoderAgentCard,
  type A2AEnvelopeValidationIssue,
  type ConnectorAdapter,
  type ConnectorAuditEvent,
  type ConnectorCapability,
  type ConnectorContextScope,
  type ConnectorContextSnapshot,
  type ConnectorTaskRequest,
  type ConnectorTaskResult,
  type PolicyAction,
  type RecoderAgentIdentity,
  type RecoderA2AEnvelope,
  type TaskState,
  type TaskUpdate,
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
let controlPlaneRuntimePromise: Promise<{
  controlPlane: A2AControlPlane;
  registry: InMemoryAgentRegistry;
  policy: UnifiedPolicyPlane;
  persistence: 'redis' | 'memory';
}> | null = null;

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

class GatewayPassthroughConnector implements ConnectorAdapter {
  readonly protocol = 'rest' as const;

  constructor(readonly platform: RecoderAgentIdentity['platform']) {}

  async discoverCapabilities(): Promise<ConnectorCapability[]> {
    return [
      {
        id: 'gateway-intent-routing',
        name: 'Gateway Intent Routing',
        description: 'Records and routes incoming A2A intents through Recoder Web gateway',
      },
    ];
  }

  async executeTask(request: ConnectorTaskRequest): Promise<ConnectorTaskResult> {
    return {
      state: 'completed',
      resultText: `accepted:${request.assignee.id}`,
    };
  }

  async *streamTaskUpdates(taskId: string): AsyncIterable<TaskUpdate> {
    yield { taskId, state: 'completed' };
  }

  async cancelTask(): Promise<boolean> {
    return false;
  }

  async extractContext(scope: ConnectorContextScope): Promise<ConnectorContextSnapshot> {
    return { scope, metadata: { source: 'recoder-web-gateway', platform: this.platform } };
  }

  mapPlatformActionToPolicyAction(): PolicyAction | undefined {
    return 'network:call';
  }

  async emitAuditEvent(_event: ConnectorAuditEvent): Promise<void> {}
}

async function getA2AControlPlaneRuntime() {
  if (controlPlaneRuntimePromise) {
    return controlPlaneRuntimePromise;
  }

  controlPlaneRuntimePromise = (async () => {
    const registry = new InMemoryAgentRegistry();
    const policy = new UnifiedPolicyPlane();
    const redisUrl = getRedisUrl();

    if (redisUrl) {
      try {
        const moduleName = process.env.RECODER_A2A_REDIS_MODULE || 'ioredis';
        const mod = await import(/* @vite-ignore */ moduleName);
        const RedisCtor = (mod as any).default;
        const client = new RedisCtor(redisUrl, {
          maxRetriesPerRequest: 2,
          enableReadyCheck: true,
          lazyConnect: true,
        });
        await client.connect();
        const adapter = await RedisBackedPersistenceAdapter.fromClient({
          redis: {
            get: (key) => client.get(key),
            set: (key, value) => client.set(key, value),
          },
          keyPrefix: process.env.RECODER_A2A_PERSIST_PREFIX || 'a2a:persist:',
        });
        const controlPlane = new A2AControlPlane(
          registry,
          new PersistentTaskStore(adapter),
          policy,
          new PersistentAuditLogService(adapter),
          new PersistentCollaborationService(adapter),
        );
        return { controlPlane, registry, policy, persistence: 'redis' as const };
      } catch {
        // Fall back to in-memory runtime.
      }
    }

    const controlPlane = new A2AControlPlane(
      registry,
      new InMemoryTaskStore(),
      policy,
      new InMemoryAuditLogService(),
      new InMemoryCollaborationService(),
    );
    return { controlPlane, registry, policy, persistence: 'memory' as const };
  })();

  return controlPlaneRuntimePromise;
}

async function loadLatestConnectorSupportStatus(): Promise<{
  available: boolean;
  source?: string;
  path?: string;
  generatedAt?: string;
  supportGatesPass?: boolean;
  noSkipCloseoutPrecondition?: boolean;
  connectors?: Array<{ id: string; tier: string; status: string }>;
  error?: string;
}> {
  const explicitPath = process.env.RECODER_A2A_CONNECTOR_STATUS_FILE || '';
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const readStatusFile = async (filePath: string, source: string) => {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, any>;
      const connectors = Array.isArray(parsed.connectors)
        ? parsed.connectors
            .filter((item) => item && typeof item.id === 'string')
            .map((item) => ({
              id: String(item.id),
              tier: String(item.tier || 'unknown'),
              status: String(item.status || 'unknown'),
            }))
        : [];
      const supportInputs = (parsed.support_gate_inputs || {}) as Record<string, unknown>;
      return {
        available: true as const,
        source,
        path: filePath,
        generatedAt: typeof parsed.generated_at_utc === 'string' ? parsed.generated_at_utc : undefined,
        supportGatesPass:
          typeof supportInputs.support_gates_pass === 'boolean'
            ? supportInputs.support_gates_pass
            : undefined,
        noSkipCloseoutPrecondition:
          typeof supportInputs.no_skip_closeout_precondition === 'boolean'
            ? supportInputs.no_skip_closeout_precondition
            : undefined,
        connectors,
      };
    };

    if (explicitPath) {
      return await readStatusFile(explicitPath, 'explicit');
    }

    const root = process.cwd();
    const candidateDirs = [
      path.resolve(root, 'logs/phase3-gates'),
      path.resolve(root, '../logs/phase3-gates'),
      path.resolve(root, 'logs/release-evidence'),
      path.resolve(root, '../logs/release-evidence'),
    ];

    for (const dir of candidateDirs) {
      try {
        const entries = await fs.readdir(dir);
        const candidates = entries
          .filter((name) => name.endsWith('-connectors-support.json'))
          .sort()
          .reverse();
        if (candidates.length === 0) continue;
        const filePath = path.join(dir, candidates[0]);
        const source = dir.includes('phase3-gates') ? 'phase3-gates' : 'release-evidence';
        return await readStatusFile(filePath, source);
      } catch {
        // try next directory
      }
    }

    return { available: false, error: 'no connector support artifact found' };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'connector_status_load_failed',
    };
  }
}

export async function getA2ARuntimeDiagnostics(): Promise<Record<string, unknown>> {
  const redisUrl = getRedisUrl();
  try {
    const runtime = await getA2AControlPlaneRuntime();
    const registeredAgents = runtime.registry.list();
    const connectorStatus = await loadLatestConnectorSupportStatus();
    const gateReadiness =
      connectorStatus.available === true && typeof connectorStatus.supportGatesPass === 'boolean'
        ? connectorStatus.supportGatesPass
        : null;
    const lastError = connectorStatus.available ? undefined : connectorStatus.error;

    return {
      ok: true,
      persistence: runtime.persistence,
      redisConfigured: Boolean(redisUrl),
      redisModule: process.env.RECODER_A2A_REDIS_MODULE || 'ioredis',
      persistPrefix: process.env.RECODER_A2A_PERSIST_PREFIX || 'a2a:persist:',
      registeredAgents: registeredAgents.length,
      tier1Agents: registeredAgents.filter((agent) => agent.tier === 'tier1').length,
      tier2Agents: registeredAgents.filter((agent) => agent.tier === 'tier2').length,
      gateReadiness,
      connectorStatus,
      ...(lastError ? { lastError } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      persistence: 'error',
      redisConfigured: Boolean(redisUrl),
      gateReadiness: false,
      connectorStatus: { available: false },
      lastError: error instanceof Error ? error.message : 'runtime_diagnostics_failed',
      error: error instanceof Error ? error.message : 'runtime_diagnostics_failed',
    };
  }
}

function extractEnvelopeText(envelope: GatewayEnvelope): string {
  const textPart = Array.isArray(envelope.payload)
    ? envelope.payload.find((part) => isRecord(part) && part.kind === 'text' && typeof part.text === 'string')
    : null;
  if (isRecord(textPart) && typeof textPart.text === 'string') {
    return textPart.text;
  }
  return `intent:${envelope.intent}`;
}

function ensureGatewayAgentRegistered(input: {
  runtime: Awaited<ReturnType<typeof getA2AControlPlaneRuntime>>;
  identity: RecoderAgentIdentity;
}): void {
  const { runtime, identity } = input;
  const existing = runtime.registry.get(identity.id);
  if (existing) return;

  const isTier1 = identity.platform === 'codex' || identity.platform === 'claude_code';
  runtime.registry.register({
    identity,
    protocol: 'rest',
    tier: isTier1 ? 'tier1' : 'tier2',
    status: isTier1 ? 'experimental' : 'backlog',
    tags: ['a2a-gateway', identity.platform],
    card: createRecoderAgentCard({
      name: identity.name || identity.id,
      description: `Gateway-registered identity for ${identity.platform}`,
      version: '2026-02-15',
      url: process.env.RECODER_WEB_URL || process.env.MAIN_SITE_URL || 'https://web.recoder.xyz',
      skills: [
        {
          id: 'intent-routing',
          name: 'Intent Routing',
          description: 'Accept and route A2A intents through Recoder Web',
          tags: ['a2a', 'routing'],
        },
      ],
    }),
  });
  runtime.controlPlane.attachConnector(identity.id, new GatewayPassthroughConnector(identity.platform));

  const autoActions: PolicyAction[] = [
    'file:read',
    'file:write',
    'file:delete',
    'bash:exec',
    'network:call',
    'git:push',
    'env:access',
  ];
  for (const action of autoActions) {
    runtime.policy.setRule(identity.id, action, 'auto');
  }
}

async function recordEnvelopeInControlPlane(envelope: GatewayEnvelope): Promise<Record<string, unknown>> {
  try {
    const runtime = await getA2AControlPlaneRuntime();
    ensureGatewayAgentRegistered({ runtime, identity: envelope.from });
    ensureGatewayAgentRegistered({ runtime, identity: envelope.to });

    const details: Record<string, unknown> = {
      persistence: runtime.persistence,
    };

    try {
      const channelId = `a2a:${envelope.threadId}`;
      runtime.controlPlane.createChannel({
        id: channelId,
        scope: 'channel',
        name: `a2a-${envelope.threadId}`,
        memberAgentIds: [envelope.from.id, envelope.to.id],
      });
      runtime.controlPlane.createThread({
        id: envelope.threadId,
        channelId,
        title: `${envelope.intent}:${envelope.messageId}`,
      });
      runtime.controlPlane.postMessage({
        id: `${envelope.messageId}:msg`,
        threadId: envelope.threadId,
        senderAgentId: envelope.from.id,
        text: extractEnvelopeText(envelope),
      });
    } catch (error) {
      details.collaborationError = error instanceof Error ? error.message : 'collaboration_record_failed';
    }

    try {
      const task = await runtime.controlPlane.submitTask({
        taskId: envelope.messageId,
        threadId: envelope.threadId,
        requesterId: envelope.from.id,
        assigneeId: envelope.to.id,
        prompt: extractEnvelopeText(envelope),
        requiredAction: 'network:call',
        policyDetails: { source: 'recoder-web-api.a2a.envelope', intent: envelope.intent },
      });
      details.taskState = task.state as TaskState;
      details.taskId = task.id;
    } catch (error) {
      details.taskError = error instanceof Error ? error.message : 'task_record_failed';
    }

    return details;
  } catch (error) {
    return {
      persistence: 'error',
      error: error instanceof Error ? error.message : 'control_plane_record_failed',
    };
  }
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
  const controlPlane = await recordEnvelopeInControlPlane(envelope);
  switch (envelope.intent) {
    case 'plan':
      return {
        handled: true,
        status: 'accepted',
        action: 'plan_registered',
        details: {
          ...(await dispatchIntentToBackend(envelope)),
          controlPlane,
        },
      };
    case 'execute':
      return {
        handled: true,
        status: 'accepted',
        action: 'execution_requested',
        details: {
          ...(await dispatchIntentToBackend(envelope)),
          controlPlane,
        },
      };
    case 'handoff':
      return {
        handled: true,
        status: 'accepted',
        action: 'handoff_received',
        details: {
          ...(await dispatchIntentToBackend(envelope)),
          controlPlane,
        },
      };
    case 'tool_call':
      return {
        handled: true,
        status: 'accepted',
        action: 'tool_call_received',
        details: {
          ...(await dispatchIntentToBackend(envelope)),
          controlPlane,
        },
      };
    default:
      return {
        handled: false,
        status: 'ignored',
        action: 'unsupported_intent',
        details: { intent: envelope.intent, controlPlane },
      };
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
  controlPlaneRuntimePromise = null;
}
