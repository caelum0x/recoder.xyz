"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2aRouter = exports.__testSelectTargets = void 0;
exports.buildInvalidA2AEnvelopeError = buildInvalidA2AEnvelopeError;
exports.verifyIncomingRequest = verifyIncomingRequest;
exports.checkAndStoreEnvelopeIdempotency = checkAndStoreEnvelopeIdempotency;
exports.handleA2AIntent = handleA2AIntent;
exports.getOrchestrationHistorySummary = getOrchestrationHistorySummary;
exports.appendControlPlaneLifecycleEvent = appendControlPlaneLifecycleEvent;
exports.appendTaskScopedControlPlaneLifecycleEvent = appendTaskScopedControlPlaneLifecycleEvent;
exports.appendControlPlaneEvidence = appendControlPlaneEvidence;
exports.listBridgeSessionsForBinding = listBridgeSessionsForBinding;
exports.getDockerBackendAgentCard = getDockerBackendAgentCard;
exports.__createSignatureForTest = __createSignatureForTest;
exports.__resetA2ATestState = __resetA2ATestState;
const express_1 = require("express");
const ioredis_1 = __importDefault(require("ioredis"));
const a2a_1 = require("@recoder/shared/a2a");
const a2a_sdk_1 = require("@recoder/a2a-sdk");
const workspace_service_1 = require("./a2a/workspace.service");
const agent_registry_service_1 = require("./a2a/agent-registry.service");
const task_lifecycle_service_1 = require("./a2a/task-lifecycle.service");
const router = (0, express_1.Router)();
exports.a2aRouter = router;
// A2A Agent Card (standard A2A protocol discovery)
router.get('/.well-known/agent.json', (_req, res) => {
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
router.get('/', (_req, res) => {
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
const idempotencyStore = new Map();
const agentRegistryStore = new Map();
let orchestrationPolicyStore = null;
const orchestrationStore = new Map();
const bridgeJobQueueStore = new Map();
const bridgeResultStore = new Map();
const bridgeResultAckStore = new Map();
const bridgeHeartbeatStore = new Map();
const bridgeSessionStore = new Map();
const auditStore = new Map();
const orchestrationHistorySubscribers = new Map();
const orchestrationHistoryEventLog = new Map();
let redisClient = null;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function asOptionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}
function normalizePlatform(value) {
    const platform = asString(value).trim();
    if (VALID_RECORDER_PLATFORMS.has(platform)) {
        return platform;
    }
    return 'custom';
}
function normalizeCapabilities(value) {
    return Array.from(new Set(asStringArray(value))).sort((a, b) => a.localeCompare(b));
}
function buildBridgeCapabilitySkills(capabilities) {
    return capabilities.map((capability) => ({
        id: capability,
        name: capability,
        description: capability,
        tags: [capability, 'bridge-capability'],
    }));
}
function stripBridgeManagedTags(tags) {
    return tags.filter((tag) => (tag !== 'bridge' &&
        !tag.startsWith('bridge:') &&
        !tag.startsWith('workspace:') &&
        !tag.startsWith('project:') &&
        !tag.startsWith('capability:')));
}
function stripBridgeManagedSkills(skills, existingTags) {
    const previousCapabilityIds = new Set(existingTags
        .filter((tag) => tag.startsWith('capability:'))
        .map((tag) => tag.slice('capability:'.length)));
    return skills.filter((skill) => {
        if (previousCapabilityIds.has(skill.id))
            return false;
        return !skill.tags.includes('bridge-capability');
    });
}
function buildBridgeDurableIdentity(input) {
    return [
        input.agentId || 'anonymous',
        input.agentPlatform || 'custom',
        input.workspaceId || 'global',
        input.projectId || 'global',
        input.scope || 'unscoped',
    ].join(':');
}
function readMetadataWorkspaceId(metadata) {
    const direct = asOptionalString(metadata?.workspaceId);
    if (direct)
        return direct;
    return asOptionalString(metadata?.workspace_id);
}
function adaptGatewayEnvelopeToCanonicalTaskEnvelope(envelope) {
    const metadata = isRecord(envelope.metadata) ? envelope.metadata : {};
    const workspaceId = readMetadataWorkspaceId(metadata) || 'global';
    const traceId = asOptionalString(envelope.trace?.traceId) ||
        asOptionalString(metadata.traceId) ||
        asOptionalString(metadata.trace_id) ||
        `trace-${envelope.messageId}`;
    return {
        envelope_version: envelope.envelopeVersion || '1.0.0',
        id: envelope.messageId,
        workspace_id: workspaceId,
        thread_id: envelope.threadId,
        trace_id: traceId,
        parent_id: asOptionalString(envelope.trace?.parentMessageId) || undefined,
        state: 'submitted',
        history: [],
        requester: {
            agent_id: envelope.from.id,
            platform: envelope.from.platform,
            ...(envelope.from.name ? { name: envelope.from.name } : {}),
            ...(envelope.from.instanceId ? { instance_id: envelope.from.instanceId } : {}),
        },
        assignee: {
            agent_id: envelope.to.id,
            platform: envelope.to.platform,
            ...(envelope.to.name ? { name: envelope.to.name } : {}),
            ...(envelope.to.instanceId ? { instance_id: envelope.to.instanceId } : {}),
        },
        connector: {
            connector_id: `${envelope.to.platform}:${envelope.to.id}`,
            platform: envelope.to.platform,
            protocol: 'a2a',
            name: envelope.to.name,
            metadata: {
                intent: envelope.intent,
                protocolVersion: envelope.protocolVersion,
            },
        },
        payload: (Array.isArray(envelope.payload) ? envelope.payload : []),
        created_at: envelope.createdAt,
        updated_at: envelope.createdAt,
        metadata: {
            ...metadata,
            intent: envelope.intent,
            protocolVersion: envelope.protocolVersion,
            envelopeVersion: envelope.envelopeVersion,
            from: envelope.from,
            to: envelope.to,
        },
        tags: ['gateway-ingress', `intent:${envelope.intent}`],
    };
}
function mapValidationIssuesToEnvelopeIssues(issues, sourcePath) {
    return issues.map((issue) => ({
        path: issue.path.startsWith('$') ? sourcePath : `${sourcePath}.${issue.path}`,
        message: issue.message,
    }));
}
function buildCanonicalA2AError(input) {
    return (0, a2a_sdk_1.buildA2AError)({
        code: input.code,
        message: input.message,
        details: input.detail,
    });
}
function respondCanonicalA2AError(res, status, input) {
    const a2aError = buildCanonicalA2AError({
        code: input.code,
        message: input.message,
        detail: input.detail,
    });
    res.status(status).json({
        ok: false,
        error: input.legacyError || input.message,
        a2aError,
    });
}
function parseEnvelopeFromUnknown(value, sourcePath = 'envelope') {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ path: sourcePath, message: 'must be an object' }] };
    }
    const messageId = asString(value.messageId).trim();
    const threadId = asString(value.threadId).trim();
    const intent = asString(value.intent).trim();
    if (!messageId)
        issues.push({ path: `${sourcePath}.messageId`, message: 'must be a non-empty string' });
    if (!threadId)
        issues.push({ path: `${sourcePath}.threadId`, message: 'must be a non-empty string' });
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
    if (!fromId)
        issues.push({ path: `${sourcePath}.from.id`, message: 'must be a non-empty string' });
    if (!toId)
        issues.push({ path: `${sourcePath}.to.id`, message: 'must be a non-empty string' });
    const payloadInput = value.payload;
    if (!Array.isArray(payloadInput)) {
        issues.push({ path: `${sourcePath}.payload`, message: 'must be an array' });
    }
    const createdAtInput = asString(value.createdAt).trim();
    const createdAt = createdAtInput || new Date().toISOString();
    if (createdAtInput && Number.isNaN(Date.parse(createdAtInput))) {
        issues.push({ path: `${sourcePath}.createdAt`, message: 'must be a valid ISO-8601 timestamp string' });
    }
    if (issues.length > 0)
        return { ok: false, issues };
    const fromRecord = fromInput;
    const toRecord = toInput;
    const metadata = isRecord(value.metadata) ? value.metadata : undefined;
    const traceRaw = value.trace;
    const trace = isRecord(traceRaw) && asString(traceRaw.traceId).trim()
        ? {
            traceId: asString(traceRaw.traceId).trim(),
            parentMessageId: asString(traceRaw.parentMessageId).trim() || undefined,
        }
        : undefined;
    const envelope = {
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
        payload: payloadInput,
        metadata,
        trace,
    };
    const canonicalValidation = (0, a2a_sdk_1.validateTaskEnvelope)(adaptGatewayEnvelopeToCanonicalTaskEnvelope(envelope), { strictVersion: false });
    if (!canonicalValidation.valid) {
        return {
            ok: false,
            issues: mapValidationIssuesToEnvelopeIssues(canonicalValidation.issues, sourcePath),
        };
    }
    return {
        ok: true,
        envelope,
    };
}
function parseBridgeResultEnvelopeFromUnknown(value, sourcePath = 'resultEnvelope') {
    if (isCanonicalTaskEnvelopeShape(value)) {
        const validation = (0, a2a_sdk_1.validateTaskEnvelope)(value, { strictVersion: false });
        if (!validation.valid) {
            return {
                ok: false,
                issues: mapValidationIssuesToEnvelopeIssues(validation.issues, sourcePath),
            };
        }
        const metadata = isRecord(value.metadata) ? value.metadata : {};
        return {
            ok: true,
            parsed: {
                canonicalEnvelope: value,
                threadId: value.thread_id,
                traceId: value.trace_id,
                workspaceId: value.workspace_id,
                taskId: asOptionalString(metadata.taskId) ||
                    asOptionalString(metadata.task_id) ||
                    value.id,
                messageId: value.id,
                metadata,
            },
        };
    }
    const legacy = parseEnvelopeFromUnknown(value, sourcePath);
    if (!legacy.ok)
        return legacy;
    const metadata = legacy.envelope.metadata && isRecord(legacy.envelope.metadata)
        ? legacy.envelope.metadata
        : {};
    const workspaceId = readMetadataWorkspaceId(metadata);
    const traceId = asOptionalString(legacy.envelope.trace?.traceId) ||
        asOptionalString(metadata.traceId) ||
        asOptionalString(metadata.trace_id);
    // workspaceId/traceId are optional: a bridge result without full run context
    // is still accepted (stored + dispatched); run-history attachment downstream
    // is guarded on their presence, so it is simply skipped when they are absent.
    return {
        ok: true,
        parsed: {
            legacyEnvelope: legacy.envelope,
            threadId: legacy.envelope.threadId,
            traceId: traceId ?? null,
            workspaceId: workspaceId ?? null,
            taskId: asOptionalString(metadata.taskId) ||
                asOptionalString(metadata.task_id),
            messageId: legacy.envelope.messageId,
            metadata,
        },
    };
}
function isCanonicalTaskEnvelopeShape(value) {
    return (isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.workspace_id === 'string' &&
        typeof value.thread_id === 'string' &&
        typeof value.trace_id === 'string' &&
        typeof value.state === 'string');
}
function respondInvalidEnvelope(res, issues, error = 'Invalid A2A envelope') {
    res.status(400).json(buildInvalidA2AEnvelopeError({ issues, error }));
}
function buildInvalidA2AEnvelopeError(input) {
    return (0, a2a_1.buildInvalidA2AEnvelopeErrorResponse)(input);
}
function orchestrationStateKey(threadId, traceId) {
    return `${threadId}:${traceId}`;
}
function resolveHistoryStreamKey(threadId, traceId) {
    return `${A2A_HISTORY_STREAM_KEY_PREFIX}:${threadId}:${traceId}`;
}
function getRedisUrl() {
    return process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
}
function getRedisClient() {
    const url = getRedisUrl();
    if (!url)
        return null;
    if (!redisClient) {
        redisClient = new ioredis_1.default(url, {
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
function parseAllowedAgents() {
    return new Set((process.env.RECODER_A2A_ALLOWED_AGENTS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean));
}
function normalizeSignature(value) {
    return value.startsWith('v1=') ? value.slice(3) : value;
}
function normalizeTimestampMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return NaN;
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}
function secureEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i += 1)
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return mismatch === 0;
}
async function hmacHex(secret, data) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
function cleanIdempotencyStore(nowMs) {
    for (const [messageId, expiresAt] of idempotencyStore.entries()) {
        if (expiresAt <= nowMs)
            idempotencyStore.delete(messageId);
    }
}
function cleanOrchestrationStore(nowMs) {
    for (const [key, value] of orchestrationStore.entries()) {
        if (value.expiresAt <= nowMs)
            orchestrationStore.delete(key);
    }
}
function cleanBridgeState(nowMs) {
    for (const [key, value] of bridgeResultStore.entries()) {
        if (value.expiresAt <= nowMs)
            bridgeResultStore.delete(key);
    }
    for (const [jobId, expiresAt] of bridgeResultAckStore.entries()) {
        if (expiresAt <= nowMs)
            bridgeResultAckStore.delete(jobId);
    }
    for (const [key, value] of bridgeHeartbeatStore.entries()) {
        if (value.expiresAt <= nowMs)
            bridgeHeartbeatStore.delete(key);
    }
    for (const [token, value] of bridgeSessionStore.entries()) {
        if (value.expiresAt <= nowMs)
            bridgeSessionStore.delete(token);
    }
    for (const [id, value] of auditStore.entries()) {
        if (value.expiresAt <= nowMs)
            auditStore.delete(id);
    }
}
function builtinAgentEntries() {
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
async function listAgentRegistry() {
    const redis = getRedisClient();
    if (redis) {
        try {
            const rows = await redis.hgetall(AGENT_REGISTRY_KEY);
            const parsed = Object.values(rows)
                .map((value) => {
                try {
                    return JSON.parse(value);
                }
                catch {
                    return null;
                }
            })
                .filter(Boolean);
            if (parsed.length > 0)
                return parsed;
        }
        catch {
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
async function upsertAgentRegistryEntry(entry) {
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.hset(AGENT_REGISTRY_KEY, entry.agent_id, JSON.stringify(entry));
            return;
        }
        catch {
            // fall back
        }
    }
    agentRegistryStore.set(entry.agent_id, entry);
}
async function getAgentRegistryEntry(agentId) {
    const all = await listAgentRegistry();
    return all.find((entry) => entry.agent_id === agentId) || null;
}
function parseTokenScopeMap(raw) {
    const value = String(raw || '').trim();
    if (!value)
        return new Map();
    try {
        const parsed = JSON.parse(value);
        const entries = Object.entries(parsed)
            .map(([token, scope]) => [token.trim(), String(scope || '').trim()])
            .filter(([token, scope]) => Boolean(token && scope));
        return new Map(entries);
    }
    catch {
        return new Map();
    }
}
function verifyAdminToken(req) {
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
    // Fail closed: when no admin credential is configured, deny admin access
    // instead of granting it to any caller (recoder-0zso). Production must set
    // RECODER_A2A_ADMIN_TOKEN (or RECODER_A2A_ADMIN_TOKEN_SCOPES) to enable admin routes.
    if (!expected) {
        return {
            ok: false,
            status: 503,
            error: 'Admin access is not configured (set RECODER_A2A_ADMIN_TOKEN)',
        };
    }
    if (!provided || provided !== expected) {
        return { ok: false, status: 401, error: 'Unauthorized admin token' };
    }
    const scope = String(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE || '').trim() || null;
    return { ok: true, scope };
}
function verifyBridgeToken(req) {
    const authHeader = String(req.header('authorization') || '');
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearerToken)
        return { ok: false, status: 401, error: 'Unauthorized bridge token' };
    return { ok: true };
}
function asBool(value, fallback) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
    }
    return fallback;
}
function normalizeMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'codex_only')
        return 'codex_only';
    if (mode === 'claude_only')
        return 'claude_only';
    if (mode === 'parallel')
        return 'parallel';
    if (mode === 'handoff')
        return 'handoff';
    if (mode === 'fallback')
        return 'fallback';
    return 'parallel';
}
async function verifyIncomingRequest(input) {
    const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
    if (!secret)
        return { ok: false, status: 503, error: 'RECODER_A2A_SHARED_SECRET is not configured' };
    const senderId = String(input.headers['x-recoder-a2a-agent-id'] || '').trim();
    if (!senderId)
        return { ok: false, status: 401, error: 'Missing x-recoder-a2a-agent-id header' };
    const allowedAgents = parseAllowedAgents();
    if (allowedAgents.size > 0 && !allowedAgents.has(senderId)) {
        return { ok: false, status: 403, error: 'Sender agent is not allowed' };
    }
    const timestamp = input.headers['x-recoder-a2a-timestamp'];
    const signature = input.headers['x-recoder-a2a-signature'];
    if (!timestamp || !signature)
        return { ok: false, status: 401, error: 'Missing signature headers' };
    const timestampMs = normalizeTimestampMs(timestamp);
    if (!Number.isFinite(timestampMs))
        return { ok: false, status: 400, error: 'Invalid x-recoder-a2a-timestamp header' };
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
async function checkAndStoreEnvelopeIdempotency(envelope) {
    const nowMs = Date.now();
    cleanIdempotencyStore(nowMs);
    if (!envelope?.messageId)
        return { accepted: false, duplicate: false };
    const redis = getRedisClient();
    if (redis) {
        try {
            const key = `${IDEMPOTENCY_KEY_PREFIX}:${envelope.messageId}`;
            const ttlSeconds = Math.max(1, Math.ceil(IDEMPOTENCY_TTL_MS / 1000));
            const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
            return { accepted: true, duplicate: result !== 'OK' };
        }
        catch {
            // Fallback to in-memory if Redis is unavailable.
        }
    }
    const existingExpiry = idempotencyStore.get(envelope.messageId);
    if (existingExpiry && existingExpiry > nowMs)
        return { accepted: true, duplicate: true };
    idempotencyStore.set(envelope.messageId, nowMs + IDEMPOTENCY_TTL_MS);
    return { accepted: true, duplicate: false };
}
function resolveIntentWebhook(intent) {
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
function resolveIntentExecutor(intent) {
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
function verifyWorkerTokenHeader(req) {
    const expected = process.env.RECODER_A2A_WORKER_TOKEN || '';
    if (!expected)
        return { ok: true };
    const provided = String(req.header('x-recoder-a2a-worker-token') || '');
    if (!provided || provided !== expected) {
        return { ok: false, status: 401, error: 'Unauthorized worker token' };
    }
    return { ok: true };
}
async function dispatchIntentToBackend(envelope) {
    const details = {};
    const targetService = String(envelope?.to?.platform || envelope?.to?.id || '');
    const fromService = String(envelope?.from?.platform || envelope?.from?.id || '');
    const redis = getRedisClient();
    if (redis) {
        try {
            const streamId = await redis.xadd(INTENT_STREAM_KEY, '*', 'service', 'docker-backend', 'fromService', fromService || 'recoder_backend', 'targetService', targetService || 'unknown', 'intent', String(envelope.intent), 'messageId', String(envelope.messageId), 'threadId', String(envelope.threadId), 'payload', JSON.stringify(envelope.payload ?? []), 'envelope', JSON.stringify(envelope));
            details.redis = { queued: true, streamKey: INTENT_STREAM_KEY, streamId };
        }
        catch (error) {
            details.redis = { queued: false, error: 'xadd_failed' };
        }
    }
    else {
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
        }
        catch (error) {
            details.webhook = { dispatched: false, error: 'fetch_failed' };
        }
    }
    return details;
}
async function handleA2AIntent(envelope) {
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
function isAllowedTarget(targetUrl) {
    const allowListRaw = process.env.RECODER_A2A_EGRESS_ALLOWLIST || '';
    const allowList = allowListRaw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (allowList.length === 0)
        return true;
    return allowList.some((allowedPrefix) => targetUrl.startsWith(allowedPrefix));
}
async function dispatchSignedEnvelope(input) {
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
function selectTargets(input) {
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
            if (primary === 'claude_code')
                return (claudeReady ? ['claude_code'] : []).concat(codexReady ? ['codex'] : []);
            return (codexReady ? ['codex'] : []).concat(claudeReady ? ['claude_code'] : []);
        case 'fallback':
            if (primary === fallback)
                return primary === 'codex' && codexReady ? ['codex'] : claudeReady ? ['claude_code'] : [];
            if (primary === 'claude_code')
                return (claudeReady ? ['claude_code'] : []).concat(codexReady ? ['codex'] : []);
            if (primary === 'codex')
                return (codexReady ? ['codex'] : []).concat(claudeReady ? ['claude_code'] : []);
            return [];
        case 'parallel':
        default:
            return [codexReady ? 'codex' : '', claudeReady ? 'claude_code' : ''].filter(Boolean);
    }
}
async function persistOrchestrationState(input) {
    const key = `${ORCHESTRATION_KEY_PREFIX}:${input.threadId}:${input.traceId}`;
    const value = JSON.stringify({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        traceId: input.traceId,
        mode: input.mode,
        targets: input.targets,
        results: input.results,
        merge: input.merge ?? null,
        overrideHistory: input.overrideHistory ?? [],
        lifecycle: input.lifecycle ?? [],
        evidence: input.evidence ?? [],
        scope: input.scope ?? null,
        updatedAt: new Date().toISOString(),
    });
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(key, value, 'PX', ORCHESTRATION_TTL_MS);
            return;
        }
        catch {
            // fall back
        }
    }
    cleanOrchestrationStore(Date.now());
    orchestrationStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}
function computeDeterministicMerge(input) {
    if (input.results.length === 0)
        return null;
    if (input.mode !== 'parallel' && input.mode !== 'handoff' && input.mode !== 'fallback')
        return null;
    const primary = input.primaryAgent === 'claude_code' ? 'claude_code' : input.primaryAgent === 'codex' ? 'codex' : null;
    const scored = input.results.map((row, index) => {
        const agentId = String(row.agentId || '');
        const ok = Boolean(row.ok);
        const queued = Boolean(row.queued);
        const status = Number(row.status || 0);
        const durationMsRaw = Number(row.durationMs || 0);
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
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.agentId !== b.agentId)
            return a.agentId < b.agentId ? -1 : 1;
        return 0;
    });
    const winner = scored[0];
    const runnerUp = scored.length > 1 ? scored[1] : null;
    const conflictReasons = [];
    if (runnerUp && winner.score === runnerUp.score)
        conflictReasons.push('tie_score');
    if (!winner.ok)
        conflictReasons.push('winner_failed');
    if (scored.every((candidate) => !candidate.ok))
        conflictReasons.push('all_failed');
    if (winner.queued)
        conflictReasons.push('queued_winner');
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
function resolveBridgeQueueKey(bridgeId) {
    return `${BRIDGE_JOB_QUEUE_PREFIX}:${bridgeId}`;
}
function resolveBridgeResultKey(jobId) {
    return `${BRIDGE_RESULT_KEY_PREFIX}:${jobId}`;
}
function resolveBridgeHeartbeatKey(bridgeId) {
    return `${BRIDGE_HEARTBEAT_KEY_PREFIX}:${bridgeId}`;
}
function resolveBridgeResultAckKey(jobId) {
    return `${BRIDGE_RESULT_ACK_KEY_PREFIX}:${jobId}`;
}
function resolveBridgeSessionKey(token) {
    return `${BRIDGE_SESSION_KEY_PREFIX}:${token}`;
}
function parseAllowedIntentsForOrchestrator() {
    const raw = String(process.env.RECODER_A2A_ORCH_ALLOWED_INTENTS || 'plan,execute,handoff,tool_call,review').trim();
    return new Set(raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean));
}
function parseDualApprovalIntents() {
    const raw = String(process.env.RECODER_A2A_ORCH_DUAL_APPROVAL_INTENTS || '').trim();
    if (!raw)
        return new Set();
    return new Set(raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean));
}
function defaultOrchestrationPolicy() {
    return {
        allowedIntents: Array.from(parseAllowedIntentsForOrchestrator()),
        maxTargets: A2A_ORCH_MAX_TARGETS,
        maxDeadlineMs: A2A_ORCH_MAX_DEADLINE_MS,
        requireDualApprovalIntents: Array.from(parseDualApprovalIntents()),
        updatedAt: new Date().toISOString(),
    };
}
async function getOrchestrationPolicy() {
    const redis = getRedisClient();
    if (redis) {
        try {
            const raw = await redis.get(ORCHESTRATION_POLICY_KEY);
            if (raw)
                return JSON.parse(raw);
        }
        catch {
            // fall back
        }
    }
    if (!orchestrationPolicyStore)
        orchestrationPolicyStore = defaultOrchestrationPolicy();
    return orchestrationPolicyStore;
}
async function upsertOrchestrationPolicy(next) {
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(ORCHESTRATION_POLICY_KEY, JSON.stringify(next));
            return;
        }
        catch {
            // fall back
        }
    }
    orchestrationPolicyStore = next;
}
async function enqueueBridgeJob(input) {
    const redis = getRedisClient();
    const queueKey = resolveBridgeQueueKey(input.bridgeId);
    if (redis) {
        try {
            await redis.rpush(queueKey, JSON.stringify(input.job));
            return;
        }
        catch {
            // fall back
        }
    }
    const queue = bridgeJobQueueStore.get(input.bridgeId) || [];
    queue.push(input.job);
    bridgeJobQueueStore.set(input.bridgeId, queue);
}
function bridgeJobMatchesScope(job, scope) {
    if (!scope)
        return true;
    return String(job.scope || '').trim() === scope;
}
async function dequeueBridgeJob(bridgeId, scope) {
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
                        return JSON.parse(raw);
                    }
                    catch {
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
                if (nextRows.length > 0)
                    tx.rpush(queueKey, ...nextRows);
                const exec = await tx.exec();
                if (exec) {
                    return JSON.parse(selectedRaw);
                }
            }
            return null;
        }
        catch {
            // fall back
        }
    }
    const queue = bridgeJobQueueStore.get(bridgeId) || [];
    const selectedIndex = queue.findIndex((job) => bridgeJobMatchesScope(job, scope));
    const job = selectedIndex >= 0 ? (queue.splice(selectedIndex, 1)[0] ?? null) : null;
    bridgeJobQueueStore.set(bridgeId, queue);
    return job;
}
async function storeBridgeResult(input) {
    const key = resolveBridgeResultKey(input.jobId);
    const value = JSON.stringify({ ...input.result, updatedAt: new Date().toISOString() });
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(key, value, 'PX', ORCHESTRATION_TTL_MS);
            return;
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    bridgeResultStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}
async function checkAndStoreBridgeResultIdempotency(jobId) {
    if (!jobId)
        return { accepted: false, duplicate: false };
    const redis = getRedisClient();
    if (redis) {
        try {
            const ttlSeconds = Math.max(1, Math.ceil(ORCHESTRATION_TTL_MS / 1000));
            const result = await redis.set(resolveBridgeResultAckKey(jobId), '1', 'EX', ttlSeconds, 'NX');
            return { accepted: true, duplicate: result !== 'OK' };
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    const hit = bridgeResultAckStore.get(jobId);
    if (hit && hit > Date.now())
        return { accepted: true, duplicate: true };
    bridgeResultAckStore.set(jobId, Date.now() + ORCHESTRATION_TTL_MS);
    return { accepted: true, duplicate: false };
}
async function getBridgeResult(jobId) {
    const key = resolveBridgeResultKey(jobId);
    const redis = getRedisClient();
    if (redis) {
        try {
            const raw = await redis.get(key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    const hit = bridgeResultStore.get(key);
    if (!hit)
        return null;
    return JSON.parse(hit.value);
}
async function storeBridgeHeartbeat(input) {
    const key = resolveBridgeHeartbeatKey(input.bridgeId);
    const value = JSON.stringify({ ...input.payload, updatedAt: new Date().toISOString() });
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.set(key, value, 'PX', BRIDGE_HEARTBEAT_TTL_MS);
            return;
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    bridgeHeartbeatStore.set(key, { expiresAt: Date.now() + BRIDGE_HEARTBEAT_TTL_MS, value });
}
async function getOrchestrationState(input) {
    const key = `${ORCHESTRATION_KEY_PREFIX}:${input.threadId}:${input.traceId}`;
    const redis = getRedisClient();
    if (redis) {
        try {
            const raw = await redis.get(key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            // fall back
        }
    }
    cleanOrchestrationStore(Date.now());
    const hit = orchestrationStore.get(key);
    if (!hit)
        return null;
    return JSON.parse(hit.value);
}
async function getOrchestrationHistorySummary(input) {
    const state = await getOrchestrationState(input);
    if (!state)
        return null;
    const history = buildOrchestrationHistoryPayload({
        threadId: input.threadId,
        traceId: input.traceId,
        state,
        cursor: 0,
        limit: 1,
    });
    return {
        historyVersion: history.historyVersion,
        workspaceId: history.workspaceId,
        threadId: history.threadId,
        traceId: history.traceId,
        summary: history.summary,
    };
}
async function upsertOrchestrationStateRecord(input) {
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
        }
        catch {
            // fall back
        }
    }
    cleanOrchestrationStore(Date.now());
    orchestrationStore.set(key, { expiresAt: Date.now() + ORCHESTRATION_TTL_MS, value });
}
function extractResultsFromState(state) {
    const value = state.results;
    return Array.isArray(value) ? value : [];
}
function extractLifecycleFromState(state) {
    const value = state.lifecycle;
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => ({
        id: String(entry?.id || ''),
        at: String(entry?.at || ''),
        eventType: String(entry?.eventType || ''),
        workspaceId: String(entry?.workspaceId || ''),
        threadId: String(entry?.threadId || ''),
        traceId: String(entry?.traceId || ''),
        taskId: asOptionalString(entry?.taskId),
        actorId: asOptionalString(entry?.actorId),
        state: asOptionalString(entry?.state),
        detail: isRecord(entry?.detail) ? entry.detail : null,
    }))
        .filter((entry) => Boolean(entry.id && entry.at && entry.eventType && entry.workspaceId && entry.threadId && entry.traceId));
}
function extractEvidenceFromState(state) {
    const value = state.evidence;
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => ({
        id: String(entry?.id || ''),
        at: String(entry?.at || ''),
        workspaceId: String(entry?.workspaceId || ''),
        threadId: String(entry?.threadId || ''),
        traceId: String(entry?.traceId || ''),
        taskId: asOptionalString(entry?.taskId),
        agentId: asOptionalString(entry?.agentId),
        kind: String(entry?.kind || ''),
        label: String(entry?.label || ''),
        ref: asOptionalString(entry?.ref),
        metadata: isRecord(entry?.metadata) ? entry.metadata : null,
    }))
        .filter((entry) => Boolean(entry.id && entry.at && entry.workspaceId && entry.threadId && entry.traceId && entry.kind && entry.label));
}
function extractOverrideHistoryFromState(state) {
    const value = state.overrideHistory;
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => ({
        at: String(entry?.at || ''),
        by: String(entry?.by || ''),
        winnerAgentId: String(entry?.winnerAgentId || ''),
        previousWinnerAgentId: (() => {
            const candidate = entry?.previousWinnerAgentId;
            if (candidate === null || candidate === undefined || candidate === '')
                return null;
            return String(candidate);
        })(),
        reason: String(entry?.reason || ''),
    }))
        .filter((entry) => Boolean(entry.at && entry.by && entry.winnerAgentId));
}
function buildLifecycleTimelineEntry(entry) {
    return {
        at: entry.at,
        type: entry.eventType,
        detail: entry.detail || null,
        taskId: entry.taskId || null,
        actorId: entry.actorId || null,
        state: entry.state || null,
    };
}
function buildEvidenceTimelineEntry(entry) {
    return {
        at: entry.at,
        type: 'evidence.attached',
        detail: {
            kind: entry.kind,
            label: entry.label,
            ref: entry.ref || null,
            metadata: entry.metadata || null,
            taskId: entry.taskId || null,
            agentId: entry.agentId || null,
        },
    };
}
function extractEvidencePayloadItems(value, fallbackTaskId, fallbackAgentId) {
    if (!isRecord(value))
        return [];
    const previewUrl = asOptionalString(value.previewUrl) ||
        asOptionalString(value.preview?.url);
    const pullRequestRecord = isRecord(value.pullRequest)
        ? value.pullRequest
        : isRecord(value.pull_request)
            ? value.pull_request
            : isRecord(value.pr)
                ? value.pr
                : null;
    const pullRequestUrl = asOptionalString(value.pullRequestUrl) ||
        asOptionalString(value.pull_request_url) ||
        asOptionalString(value.prUrl) ||
        asOptionalString(value.pr_url) ||
        asOptionalString(pullRequestRecord?.url) ||
        asOptionalString(pullRequestRecord?.html_url);
    const pullRequestNumberRaw = value.pullRequestNumber ??
        value.pull_request_number ??
        value.prNumber ??
        value.pr_number ??
        pullRequestRecord?.number;
    const pullRequestNumber = typeof pullRequestNumberRaw === 'number'
        ? String(pullRequestNumberRaw)
        : asOptionalString(pullRequestNumberRaw);
    const gitStatus = asOptionalString(value.gitStatus) || asOptionalString(value.git_status);
    const gitBranch = asOptionalString(value.gitBranch) || asOptionalString(value.git_branch);
    const cloneUrl = asOptionalString(value.cloneUrl) || asOptionalString(value.clone_url);
    const runtimeType = asOptionalString(value.runtimeType) || asOptionalString(value.runtime_type);
    const sessionId = asOptionalString(value.sessionId) || asOptionalString(value.session_id);
    const sandboxId = asOptionalString(value.sandboxId) || asOptionalString(value.sandbox_id);
    const artifacts = Array.isArray(value.artifacts) ? value.artifacts : [];
    const evidence = [];
    if (previewUrl) {
        evidence.push({
            kind: 'preview',
            label: 'Preview URL',
            ref: previewUrl,
            metadata: {
                ...(fallbackTaskId ? { taskId: fallbackTaskId } : {}),
                ...(fallbackAgentId ? { agentId: fallbackAgentId } : {}),
            },
        });
    }
    if (pullRequestUrl) {
        evidence.push({
            kind: 'pull_request',
            label: pullRequestNumber ? `Pull request #${pullRequestNumber}` : 'Pull request',
            ref: pullRequestUrl,
            metadata: {
                ...(pullRequestNumber ? { pullRequestNumber } : {}),
                ...(fallbackTaskId ? { taskId: fallbackTaskId } : {}),
                ...(fallbackAgentId ? { agentId: fallbackAgentId } : {}),
                ...(pullRequestRecord ? { pullRequest: pullRequestRecord } : {}),
            },
        });
    }
    if (gitStatus || gitBranch || cloneUrl) {
        evidence.push({
            kind: 'runtime',
            label: gitBranch ? `Git provenance (${gitBranch})` : 'Git provenance',
            ref: gitBranch ? `git:${gitBranch}` : 'git',
            metadata: {
                ...(gitStatus ? { gitStatus } : {}),
                ...(gitBranch ? { gitBranch } : {}),
                ...(cloneUrl ? { cloneUrl } : {}),
            },
        });
    }
    if (runtimeType || sessionId || sandboxId) {
        evidence.push({
            kind: 'runtime',
            label: runtimeType ? `Runtime session (${runtimeType})` : 'Runtime session',
            ref: sessionId || sandboxId || runtimeType || 'runtime',
            metadata: {
                ...(runtimeType ? { runtimeType } : {}),
                ...(sessionId ? { sessionId } : {}),
                ...(sandboxId ? { sandboxId } : {}),
            },
        });
    }
    for (const artifact of artifacts) {
        if (!isRecord(artifact))
            continue;
        const key = asOptionalString(artifact.key);
        if (!key)
            continue;
        evidence.push({
            kind: asOptionalString(artifact.artifact_type) || 'artifact',
            label: asOptionalString(artifact.path) || key,
            ref: key,
            metadata: isRecord(artifact.metadata) ? artifact.metadata : null,
        });
    }
    return evidence;
}
function collectRecordPayloads(value, keys) {
    if (!isRecord(value))
        return [];
    const records = [];
    for (const key of keys) {
        const candidate = value[key];
        if (isRecord(candidate)) {
            records.push(candidate);
            continue;
        }
        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                if (isRecord(item))
                    records.push(item);
            }
        }
    }
    return records;
}
function uniqueRecordsById(records, idKeys) {
    const seen = new Set();
    const result = [];
    for (const record of records) {
        const id = idKeys
            .map((key) => asOptionalString(record[key]))
            .find(Boolean);
        const key = id || JSON.stringify(record);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(record);
    }
    return result;
}
function normalizeRuntimeEvidenceRecord(value) {
    const evidenceId = asOptionalString(value.evidenceId);
    const kind = asOptionalString(value.kind);
    const source = asOptionalString(value.source);
    const summary = asOptionalString(value.summary);
    const capturedAt = asOptionalString(value.capturedAt);
    if (!evidenceId || !kind || !source || !summary || !capturedAt)
        return null;
    return {
        evidenceId,
        kind: kind,
        source,
        summary,
        capturedAt,
        workspaceId: asOptionalString(value.workspaceId) || undefined,
        taskId: asOptionalString(value.taskId) || undefined,
        runId: asOptionalString(value.runId) || undefined,
        traceId: asOptionalString(value.traceId) || undefined,
        artifact: normalizeRuntimeEvidenceArtifactRef(value.artifact),
        data: isRecord(value.data) ? value.data : undefined,
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}
function normalizeRuntimeEvidenceArtifactRef(value) {
    if (!isRecord(value))
        return undefined;
    const artifactId = asOptionalString(value.artifactId);
    if (!artifactId)
        return undefined;
    return {
        artifactId,
        key: asOptionalString(value.key) || undefined,
        uri: asOptionalString(value.uri) || undefined,
        mimeType: asOptionalString(value.mimeType) || undefined,
    };
}
function extractRuntimeEvidenceItems(value, fallbackTaskId, fallbackAgentId) {
    const records = collectRecordPayloads(value, ['evidence', 'runtimeEvidence', 'runtime_evidence'])
        .map((record) => normalizeRuntimeEvidenceRecord(record))
        .filter(Boolean);
    return records.map((record) => ({
        kind: record.kind,
        label: record.summary,
        ref: record.artifact?.uri || record.artifact?.artifactId || record.evidenceId,
        metadata: {
            evidenceId: record.evidenceId,
            source: record.source,
            capturedAt: record.capturedAt,
            ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
            ...(record.taskId || fallbackTaskId ? { taskId: record.taskId || fallbackTaskId } : {}),
            ...(record.runId ? { runId: record.runId } : {}),
            ...(record.traceId ? { traceId: record.traceId } : {}),
            ...(fallbackAgentId ? { agentId: fallbackAgentId } : {}),
            ...(record.artifact ? { artifact: record.artifact } : {}),
            ...(record.data ? { data: record.data } : {}),
            ...(record.metadata ? { metadata: record.metadata } : {}),
        },
    }));
}
function normalizeApprovalCheckpoint(value) {
    const approvalId = asOptionalString(value.approvalId);
    const taskId = asOptionalString(value.taskId);
    const state = asOptionalString(value.state);
    const reason = asOptionalString(value.reason);
    const requestedAt = asOptionalString(value.requestedAt);
    const requestedBy = normalizeTaskAgentRef(value.requestedBy);
    if (!approvalId || !taskId || !state || !reason || !requestedAt || !requestedBy)
        return null;
    return {
        approvalId,
        taskId,
        state: state,
        requestedBy,
        requestedAt,
        reason,
        decidedBy: normalizeTaskAgentRef(value.decidedBy),
        decidedAt: asOptionalString(value.decidedAt) || undefined,
        decisionReason: asOptionalString(value.decisionReason) || undefined,
        policy: normalizeTaskPolicySnapshot(value.policy),
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}
function normalizeTaskAgentRef(value) {
    if (!isRecord(value))
        return undefined;
    const agentId = asOptionalString(value.agent_id) || asOptionalString(value.agentId);
    const platform = asOptionalString(value.platform);
    if (!agentId || !platform)
        return undefined;
    return {
        agent_id: agentId,
        platform: platform,
        name: asOptionalString(value.name) || undefined,
        instance_id: asOptionalString(value.instance_id) || asOptionalString(value.instanceId) || undefined,
    };
}
function normalizeTaskPolicySnapshot(value) {
    if (!isRecord(value))
        return undefined;
    const action = asOptionalString(value.action);
    const rule = asOptionalString(value.rule);
    const reason = asOptionalString(value.reason);
    const checkedAt = asOptionalString(value.checked_at) || asOptionalString(value.checkedAt);
    if (!action || typeof value.approved !== 'boolean' || !rule || !reason || !checkedAt)
        return undefined;
    return {
        action,
        approved: value.approved,
        rule,
        reason,
        checked_at: checkedAt,
    };
}
function extractApprovalCheckpoints(value) {
    return uniqueRecordsById(collectRecordPayloads(value, ['approval', 'approvalCheckpoint', 'approval_checkpoints', 'approvalCheckpoints', 'approvals']), ['approvalId'])
        .map((record) => normalizeApprovalCheckpoint(record))
        .filter(Boolean);
}
function approvalLifecycleEventType(state) {
    if (state === 'approved')
        return 'approval.approved';
    if (state === 'rejected')
        return 'approval.rejected';
    if (state === 'cancelled')
        return 'approval.cancelled';
    if (state === 'expired')
        return 'approval.expired';
    return 'approval.requested';
}
function normalizeHandoffCheckpoint(value) {
    const handoffId = asOptionalString(value.handoffId);
    const taskId = asOptionalString(value.taskId);
    const state = asOptionalString(value.state);
    const reason = asOptionalString(value.reason);
    const requestedAt = asOptionalString(value.requestedAt);
    const to = normalizeTaskAgentRef(value.to);
    if (!handoffId || !taskId || !state || !reason || !requestedAt || !to)
        return null;
    return {
        handoffId,
        taskId,
        state: state,
        from: normalizeTaskAgentRef(value.from),
        to,
        requestedAt,
        reason,
        decidedAt: asOptionalString(value.decidedAt) || undefined,
        decisionReason: asOptionalString(value.decisionReason) || undefined,
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}
function extractHandoffCheckpoints(value) {
    return uniqueRecordsById(collectRecordPayloads(value, ['handoff', 'handoffCheckpoint', 'handoff_checkpoints', 'handoffCheckpoints', 'handoffs']), ['handoffId'])
        .map((record) => normalizeHandoffCheckpoint(record))
        .filter(Boolean);
}
function handoffLifecycleEventType(state) {
    if (state === 'accepted')
        return 'handoff.accepted';
    if (state === 'rejected')
        return 'handoff.rejected';
    if (state === 'completed')
        return 'handoff.completed';
    if (state === 'cancelled')
        return 'handoff.cancelled';
    return 'handoff.requested';
}
function getRequestScope(req) {
    const scope = String(req.header(A2A_SCOPE_HEADER) || '').trim();
    return scope || null;
}
function getStateScope(state) {
    const scope = String(state.scope || '').trim();
    return scope || null;
}
function isScopeEnforced() {
    return process.env.RECODER_A2A_ENFORCE_SCOPE === 'true';
}
function isHeaderScopeFallbackAllowed() {
    return process.env.RECODER_A2A_ALLOW_HEADER_SCOPE_FALLBACK === 'true';
}
function resolveEffectiveScope(input) {
    const headerScope = getRequestScope(input.req);
    if (input.claimedScope && headerScope && input.claimedScope !== headerScope) {
        return { scope: null, error: 'Scope claim/header mismatch', status: 403 };
    }
    if (input.claimedScope)
        return { scope: input.claimedScope };
    if (isHeaderScopeFallbackAllowed())
        return { scope: headerScope };
    return { scope: null, error: 'Token scope claim is required', status: 400 };
}
function verifyScopeAccess(input) {
    if (!isScopeEnforced())
        return { ok: true };
    const effective = resolveEffectiveScope({ req: input.req, claimedScope: input.claimedScope });
    if (!effective.scope) {
        return { ok: false, status: effective.status || 400, error: effective.error || 'Missing scope' };
    }
    const stateScope = getStateScope(input.state);
    if (!stateScope)
        return { ok: false, status: 409, error: 'Orchestration scope is missing' };
    if (effective.scope !== stateScope)
        return { ok: false, status: 403, error: 'Scope mismatch for orchestration access' };
    return { ok: true };
}
function buildOrchestrationHistoryPayload(input) {
    const overrideHistory = extractOverrideHistoryFromState(input.state);
    const merge = (input.state.merge || null);
    const results = extractResultsFromState(input.state);
    const lifecycle = extractLifecycleFromState(input.state);
    const evidence = extractEvidenceFromState(input.state);
    const timelineAll = [
        {
            at: String(input.state.updatedAt || new Date().toISOString()),
            type: 'orchestration_snapshot',
            detail: {
                workspaceId: String(input.state.workspaceId || ''),
                mode: String(input.state.mode || ''),
                targets: input.state.targets || [],
                resultCount: results.length,
                lifecycleCount: lifecycle.length,
                evidenceCount: evidence.length,
            },
        },
        ...lifecycle.map((entry) => buildLifecycleTimelineEntry(entry)),
        ...evidence.map((entry) => buildEvidenceTimelineEntry(entry)),
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
        workspaceId: String(input.state.workspaceId || ''),
        threadId: input.threadId,
        traceId: input.traceId,
        summary: {
            workspaceId: String(input.state.workspaceId || ''),
            mode: String(input.state.mode || ''),
            winnerAgentId: merge ? String(merge.winnerAgentId || '') : null,
            overridden: merge ? Boolean(merge.overridden) : false,
            conflictReasons: merge && Array.isArray(merge.conflictReasons) ? merge.conflictReasons : [],
            collaboration: merge ? merge.collaboration || null : null,
            resultCount: results.length,
            lifecycleCount: lifecycle.length,
            evidenceCount: evidence.length,
            lifecycleByType: lifecycle.reduce((acc, entry) => {
                acc[entry.eventType] = (acc[entry.eventType] || 0) + 1;
                return acc;
            }, {}),
            evidenceByKind: evidence.reduce((acc, entry) => {
                acc[entry.kind] = (acc[entry.kind] || 0) + 1;
                return acc;
            }, {}),
            successfulAgents: results.filter((row) => Boolean(row.ok)).map((row) => String(row.agentId || '')),
            totalOverrideCount: overrideHistory.length,
            totalTimelineCount,
        },
        page: {
            cursor: normalizedCursor,
            limit: normalizedLimit,
            nextCursor,
        },
        overrideHistory,
        lifecycle,
        evidence,
        timeline,
    };
}
async function resolveTaskCorrelation(taskId) {
    const task = (0, task_lifecycle_service_1.getTaskLifecycleService)().getTask(taskId);
    if (!task.ok)
        return null;
    return {
        workspaceId: task.data.workspace_id,
        threadId: task.data.thread_id,
        traceId: task.data.trace_id,
        taskId: task.data.id,
    };
}
async function appendControlPlaneLifecycleEvent(input) {
    const state = await getOrchestrationState({ threadId: input.threadId, traceId: input.traceId });
    if (!state)
        return;
    const lifecycle = extractLifecycleFromState(state);
    lifecycle.push({
        id: `lifecycle-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        at: new Date().toISOString(),
        eventType: input.eventType,
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        traceId: input.traceId,
        taskId: input.taskId || null,
        actorId: input.actorId || null,
        state: input.state || null,
        detail: input.detail || null,
    });
    await upsertOrchestrationStateRecord({
        threadId: input.threadId,
        traceId: input.traceId,
        state: {
            ...state,
            lifecycle,
        },
    });
    await publishOrchestrationHistoryUpdate({
        threadId: input.threadId,
        traceId: input.traceId,
        eventType: input.eventType,
        detail: {
            ...(input.detail || {}),
            ...(input.taskId ? { taskId: input.taskId } : {}),
            ...(input.actorId ? { actorId: input.actorId } : {}),
            ...(input.state ? { state: input.state } : {}),
        },
    });
}
async function appendTaskScopedControlPlaneLifecycleEvent(input) {
    const correlation = await resolveTaskCorrelation(input.taskId);
    if (!correlation)
        return;
    await appendControlPlaneLifecycleEvent({
        ...correlation,
        eventType: input.eventType,
        actorId: input.actorId || null,
        state: input.state || null,
        detail: input.detail,
    });
}
async function appendControlPlaneEvidence(input) {
    if (input.evidence.length === 0)
        return;
    const state = await getOrchestrationState({ threadId: input.threadId, traceId: input.traceId });
    if (!state)
        return;
    const evidence = extractEvidenceFromState(state);
    const seen = new Set(evidence.map((entry) => `${entry.kind}:${entry.ref || entry.label}:${entry.taskId || ''}`));
    let appended = false;
    for (const item of input.evidence) {
        const key = `${item.kind}:${item.ref || item.label}:${input.taskId || ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        appended = true;
        evidence.push({
            id: `evidence-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            at: new Date().toISOString(),
            workspaceId: input.workspaceId,
            threadId: input.threadId,
            traceId: input.traceId,
            taskId: input.taskId || null,
            agentId: input.agentId || null,
            kind: item.kind,
            label: item.label,
            ref: item.ref || null,
            metadata: item.metadata || null,
        });
    }
    if (!appended)
        return;
    await upsertOrchestrationStateRecord({
        threadId: input.threadId,
        traceId: input.traceId,
        state: {
            ...state,
            evidence,
        },
    });
    await publishOrchestrationHistoryUpdate({
        threadId: input.threadId,
        traceId: input.traceId,
        eventType: 'evidence.attached',
        detail: {
            taskId: input.taskId || null,
            totalEvidence: evidence.length,
        },
    });
}
function subscribeOrchestrationHistory(input) {
    const key = orchestrationStateKey(input.threadId, input.traceId);
    const existing = orchestrationHistorySubscribers.get(key) || new Set();
    const subscriber = {
        res: input.res,
        eventTypes: input.eventTypes,
        sinceAtMs: input.sinceAtMs,
        lastEventId: input.lastEventId,
    };
    existing.add(subscriber);
    orchestrationHistorySubscribers.set(key, existing);
    const unsubscribe = () => {
        const set = orchestrationHistorySubscribers.get(key);
        if (!set)
            return;
        set.delete(subscriber);
        if (set.size === 0)
            orchestrationHistorySubscribers.delete(key);
    };
    return { subscriber, unsubscribe };
}
function writeSseEvent(res, event, data, id) {
    if (id)
        res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function appendHistoryStreamEvent(key, event) {
    const list = orchestrationHistoryEventLog.get(key) || [];
    list.push(event);
    const trimmed = list.length > A2A_HISTORY_STREAM_BUFFER_SIZE ? list.slice(list.length - A2A_HISTORY_STREAM_BUFFER_SIZE) : list;
    orchestrationHistoryEventLog.set(key, trimmed);
}
function historyEventFromRedisRow(row) {
    const map = new Map();
    const fields = row[1] || [];
    for (let i = 0; i < fields.length; i += 2)
        map.set(fields[i], fields[i + 1]);
    let detail = null;
    let history = null;
    try {
        detail = map.get('detail') ? JSON.parse(map.get('detail')) : null;
    }
    catch {
        detail = null;
    }
    try {
        history = map.get('history') ? JSON.parse(map.get('history')) : null;
    }
    catch {
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
async function appendHistoryStreamEventRedis(input) {
    const redis = getRedisClient();
    if (!redis)
        return input.event;
    try {
        const key = resolveHistoryStreamKey(input.threadId, input.traceId);
        const streamId = await redis.xadd(key, 'MAXLEN', '~', A2A_HISTORY_STREAM_BUFFER_SIZE, '*', 'eventType', input.event.eventType, 'at', input.event.at, 'threadId', input.event.threadId, 'traceId', input.event.traceId, 'detail', JSON.stringify(input.event.detail || null), 'history', JSON.stringify(input.event.history || null));
        return { ...input.event, id: streamId || input.event.id };
    }
    catch {
        return input.event;
    }
}
async function readHistoryStreamEventsRedis(input) {
    const redis = getRedisClient();
    if (!redis)
        return null;
    try {
        const key = resolveHistoryStreamKey(input.threadId, input.traceId);
        const start = input.afterId ? `(${input.afterId}` : '-';
        const rows = await redis.xrange(key, start, '+', 'COUNT', Math.min(Math.max(input.count || 200, 1), 500));
        return rows.map((row) => historyEventFromRedisRow(row));
    }
    catch {
        return null;
    }
}
async function readHistoryStreamLatestIdRedis(input) {
    const redis = getRedisClient();
    if (!redis)
        return null;
    try {
        const key = resolveHistoryStreamKey(input.threadId, input.traceId);
        const rows = await redis.xrevrange(key, '+', '-', 'COUNT', 1);
        if (!rows || rows.length === 0)
            return null;
        return rows[0][0];
    }
    catch {
        return null;
    }
}
function shouldDeliverHistoryEvent(subscriber, event) {
    if (subscriber.eventTypes && subscriber.eventTypes.size > 0 && !subscriber.eventTypes.has(event.eventType)) {
        return false;
    }
    if (subscriber.sinceAtMs !== null) {
        const eventAtMs = Date.parse(event.at);
        if (Number.isFinite(eventAtMs) && eventAtMs < subscriber.sinceAtMs)
            return false;
    }
    return true;
}
async function replayHistoryEvents(input) {
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
        if (matchIdx >= 0)
            startIdx = matchIdx + 1;
    }
    const replay = events.slice(startIdx).filter((event) => shouldDeliverHistoryEvent(input.subscriber, event));
    for (const event of replay) {
        writeSseEvent(input.subscriber.res, 'history_update', {
            eventType: event.eventType,
            at: event.at,
            threadId: event.threadId,
            traceId: event.traceId,
            detail: event.detail,
            history: event.history,
        }, event.id);
        input.subscriber.lastEventId = event.id;
    }
}
async function publishOrchestrationHistoryUpdate(input) {
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
    let event = {
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
    if (!subscribers || subscribers.size === 0)
        return;
    const stale = [];
    for (const subscriber of subscribers) {
        if (!shouldDeliverHistoryEvent(subscriber, event))
            continue;
        try {
            writeSseEvent(subscriber.res, 'history_update', {
                eventType: event.eventType,
                at: event.at,
                threadId: event.threadId,
                traceId: event.traceId,
                detail: event.detail,
                history: event.history,
            }, event.id);
            subscriber.lastEventId = event.id;
        }
        catch {
            stale.push(subscriber);
        }
    }
    if (stale.length > 0) {
        for (const subscriber of stale)
            subscribers.delete(subscriber);
        if (subscribers.size === 0)
            orchestrationHistorySubscribers.delete(key);
    }
}
async function getBridgeHeartbeat(bridgeId) {
    const key = resolveBridgeHeartbeatKey(bridgeId);
    const redis = getRedisClient();
    if (redis) {
        try {
            const raw = await redis.get(key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    const hit = bridgeHeartbeatStore.get(key);
    if (!hit)
        return null;
    return JSON.parse(hit.value);
}
async function listBridgeHeartbeats() {
    const redis = getRedisClient();
    if (redis) {
        try {
            const keys = await redis.keys(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:*`);
            if (keys.length > 0) {
                const rows = await redis.mget(keys);
                return keys
                    .map((key, index) => {
                    const raw = rows[index];
                    if (!raw)
                        return null;
                    try {
                        return {
                            bridgeId: key.slice(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:`.length),
                            heartbeat: JSON.parse(raw),
                        };
                    }
                    catch {
                        return null;
                    }
                })
                    .filter(Boolean);
            }
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    return Array.from(bridgeHeartbeatStore.entries()).map(([key, value]) => ({
        bridgeId: key.slice(`${BRIDGE_HEARTBEAT_KEY_PREFIX}:`.length),
        heartbeat: JSON.parse(value.value),
    }));
}
async function getBridgeQueueDepth(bridgeId) {
    const redis = getRedisClient();
    const key = resolveBridgeQueueKey(bridgeId);
    if (redis) {
        try {
            return Number(await redis.llen(key));
        }
        catch {
            // fall back
        }
    }
    return (bridgeJobQueueStore.get(bridgeId) || []).length;
}
async function storeBridgeSession(session) {
    const redis = getRedisClient();
    const ttlMs = Math.max(1000, Date.parse(session.expiresAt) - Date.now());
    if (redis) {
        try {
            await redis.set(resolveBridgeSessionKey(session.token), JSON.stringify(session), 'PX', ttlMs);
            return;
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    bridgeSessionStore.set(session.token, { expiresAt: Date.now() + ttlMs, value: JSON.stringify(session) });
}
async function getBridgeSession(token) {
    const redis = getRedisClient();
    if (redis) {
        try {
            const raw = await redis.get(resolveBridgeSessionKey(token));
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    const hit = bridgeSessionStore.get(token);
    if (!hit)
        return null;
    return JSON.parse(hit.value);
}
async function listBridgeSessions() {
    const redis = getRedisClient();
    if (redis) {
        try {
            const keys = await redis.keys(`${BRIDGE_SESSION_KEY_PREFIX}:*`);
            if (keys.length > 0) {
                const rows = await redis.mget(keys);
                return rows
                    .map((raw) => {
                    if (!raw)
                        return null;
                    try {
                        return JSON.parse(raw);
                    }
                    catch {
                        return null;
                    }
                })
                    .filter(Boolean);
            }
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    return Array.from(bridgeSessionStore.values()).map((row) => JSON.parse(row.value));
}
async function listBridgeSessionsForBinding(input) {
    const sessions = await listBridgeSessions();
    const filtered = sessions.filter((session) => {
        if (input.agentId && session.agentId !== input.agentId)
            return false;
        if (input.workspaceId && session.workspaceId !== input.workspaceId)
            return false;
        return true;
    });
    return Promise.all(filtered.map(async (session) => {
        const registryAgent = session.agentId ? (0, agent_registry_service_1.getAgentRegistryService)().getWithHealth(session.agentId) : undefined;
        return {
            ...session,
            agentName: registryAgent?.identity.name || session.agentName || null,
            agentPlatform: registryAgent
                ? normalizePlatform(registryAgent.identity.platform)
                : session.agentPlatform || null,
            heartbeat: await getBridgeHeartbeat(session.bridgeId),
            registry: registryAgent
                ? {
                    registered: true,
                    online: registryAgent.health.online,
                    lastHeartbeat: registryAgent.health.lastHeartbeat,
                    reconnectCount: registryAgent.lifecycle.reconnectCount,
                    registrationCount: registryAgent.lifecycle.registrationCount,
                }
                : {
                    registered: false,
                    online: false,
                    lastHeartbeat: null,
                    reconnectCount: 0,
                    registrationCount: 0,
                },
        };
    }));
}
async function validateBridgeSessionConflicts(input) {
    if (!input.agentId)
        return { ok: true };
    const sessions = await listBridgeSessions();
    for (const session of sessions) {
        if (session.agentId !== input.agentId)
            continue;
        if (session.durableIdentity === input.durableIdentity)
            continue;
        if ((session.agentPlatform || null) !== (input.agentPlatform || null)) {
            return {
                ok: false,
                status: 409,
                error: `Conflicting platform claim for agent ${input.agentId}`,
            };
        }
        if ((session.workspaceId || null) !== (input.workspaceId || null)) {
            return {
                ok: false,
                status: 409,
                error: `Conflicting workspace claim for agent ${input.agentId}`,
            };
        }
        if ((session.projectId || null) !== (input.projectId || null)) {
            return {
                ok: false,
                status: 409,
                error: `Conflicting project claim for agent ${input.agentId}`,
            };
        }
    }
    return { ok: true };
}
async function findReusableBridgeSession(input) {
    const sessions = await listBridgeSessions();
    return sessions.find((session) => session.durableIdentity === input.durableIdentity) || null;
}
async function emitAuditEvent(event, details) {
    const auditEvent = {
        id: `audit-${Date.now()}-${crypto.randomUUID().slice(0, 10)}`,
        at: new Date().toISOString(),
        event,
        details,
    };
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.xadd(A2A_AUDIT_STREAM_KEY, '*', 'event', auditEvent.event, 'at', auditEvent.at, 'details', JSON.stringify(auditEvent.details));
            return;
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    auditStore.set(auditEvent.id, { expiresAt: Date.now() + A2A_AUDIT_TTL_MS, value: JSON.stringify(auditEvent) });
}
async function listAuditEvents(limit) {
    const max = Math.min(Math.max(limit, 1), 200);
    const redis = getRedisClient();
    if (redis) {
        try {
            const rows = await redis.xrevrange(A2A_AUDIT_STREAM_KEY, '+', '-', 'COUNT', max);
            return rows.map((row) => {
                const fields = row[1] || [];
                const map = new Map();
                for (let i = 0; i < fields.length; i += 2)
                    map.set(fields[i], fields[i + 1]);
                let details = {};
                try {
                    details = JSON.parse(map.get('details') || '{}');
                }
                catch {
                    details = {};
                }
                return {
                    id: row[0],
                    at: map.get('at') || new Date().toISOString(),
                    event: map.get('event') || 'unknown',
                    details,
                };
            });
        }
        catch {
            // fall back
        }
    }
    cleanBridgeState(Date.now());
    return Array.from(auditStore.values())
        .map((row) => JSON.parse(row.value))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, max);
}
async function validateOrchestrationPolicy(input) {
    const policy = await getOrchestrationPolicy();
    const allowedIntents = new Set(policy.allowedIntents);
    if (!allowedIntents.has(String(input.envelope.intent))) {
        return { ok: false, status: 403, error: `Intent '${input.envelope.intent}' is not allowed by orchestrator policy` };
    }
    if (input.selectedTargets.length > policy.maxTargets) {
        return { ok: false, status: 400, error: `Too many selected targets (${input.selectedTargets.length})` };
    }
    const metadata = (input.envelope?.metadata || {});
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
function extractBearerToken(req) {
    const authHeader = String(req.header('authorization') || '');
    return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
}
async function verifyBridgeTokenForRequest(req) {
    const basic = verifyBridgeToken(req);
    if (!basic.ok)
        return basic;
    const bearerToken = extractBearerToken(req);
    const staticToken = process.env.RECODER_A2A_BRIDGE_TOKEN || '';
    if (staticToken && bearerToken === staticToken) {
        const staticScope = String(process.env.RECODER_A2A_BRIDGE_TOKEN_SCOPE || '').trim() || null;
        return { ok: true, scope: staticScope, session: null };
    }
    const session = await getBridgeSession(bearerToken);
    if (!session) {
        return { ok: false, status: 401, error: 'Unauthorized bridge token' };
    }
    const bridgeId = String(req.header('x-recoder-a2a-bridge-id') || '').trim();
    if (bridgeId && session.bridgeId !== bridgeId) {
        return { ok: false, status: 403, error: 'Bridge token does not match bridge id' };
    }
    return { ok: true, scope: session.scope || null, session };
}
function validateBridgeSessionInput(input) {
    if (input.workspaceId && !input.agentId) {
        return { ok: false, status: 400, error: 'agentId is required when workspaceId is provided' };
    }
    if (input.projectId && !input.workspaceId) {
        return { ok: false, status: 400, error: 'workspaceId is required when projectId is provided' };
    }
    return { ok: true };
}
function validateBridgeSessionWorkspaceBinding(input) {
    if (!input.workspaceId)
        return { ok: true };
    const workspace = (0, workspace_service_1.getWorkspaceService)().get(input.workspaceId);
    if (!workspace) {
        return { ok: false, status: 404, error: `Workspace not found: ${input.workspaceId}` };
    }
    if (input.projectId && workspace.projectId !== input.projectId) {
        return {
            ok: false,
            status: 409,
            error: `Workspace projectId mismatch for ${input.workspaceId}`,
        };
    }
    if (input.agentId && !workspace.memberAgentIds.includes(input.agentId)) {
        return {
            ok: false,
            status: 403,
            error: `Agent ${input.agentId} is not a member of workspace ${input.workspaceId}`,
        };
    }
    return { ok: true };
}
function reconcileBridgeSessionRegistryBinding(input) {
    if (!input.agentId)
        return { ok: true };
    const registry = (0, agent_registry_service_1.getAgentRegistryService)();
    const existing = registry.get(input.agentId);
    const desiredPlatform = input.agentPlatform || 'custom';
    const normalizedCapabilities = normalizeCapabilities(input.capabilities);
    const bridgeTags = Array.from(new Set([
        'bridge',
        `bridge:${input.bridgeId}`,
        ...(input.workspaceId ? [`workspace:${input.workspaceId}`] : []),
        ...(input.projectId ? [`project:${input.projectId}`] : []),
        ...normalizedCapabilities.map((capability) => `capability:${capability}`),
    ].filter(Boolean)));
    if (existing) {
        if (existing.identity.platform !== desiredPlatform) {
            return {
                ok: false,
                status: 409,
                error: `Agent platform mismatch for ${input.agentId}`,
            };
        }
        registry.register({
            identity: {
                ...existing.identity,
                name: input.agentName || existing.identity.name,
            },
            card: {
                ...existing.card,
                name: input.agentName || existing.card.name,
                skills: [
                    ...stripBridgeManagedSkills(existing.card.skills, existing.tags),
                    ...buildBridgeCapabilitySkills(normalizedCapabilities),
                ],
            },
            protocol: existing.protocol,
            tier: existing.tier,
            tags: [
                ...stripBridgeManagedTags(existing.tags),
                ...bridgeTags,
            ],
        });
        return { ok: true };
    }
    registry.selfRegister({
        agentId: input.agentId,
        name: input.agentName || input.agentId,
        platform: desiredPlatform,
        tags: bridgeTags,
        skills: buildBridgeCapabilitySkills(normalizedCapabilities),
    });
    return { ok: true };
}
function newBridgeSessionToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
router.post('/bridge/jobs', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const bridgeId = String(parsedBody.bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || 'default').trim();
    const agentId = String(parsedBody.agentId || '').trim();
    const envelopeParse = parseEnvelopeFromUnknown(parsedBody.envelope, 'envelope');
    if (!agentId) {
        res.status(400).json({ ok: false, error: 'agentId is required' });
        return;
    }
    if (!envelopeParse.ok) {
        respondInvalidEnvelope(res, envelopeParse.issues);
        return;
    }
    const envelope = envelopeParse.envelope;
    const traceId = String(parsedBody.traceId || envelope?.metadata?.traceId || '').trim() || undefined;
    const effectiveScope = resolveEffectiveScope({ req, claimedScope: auth.scope });
    if (isScopeEnforced() && !effectiveScope.scope) {
        res.status(effectiveScope.status || 400).json({ ok: false, error: effectiveScope.error || 'Missing scope' });
        return;
    }
    const job = {
        jobId: String(parsedBody.jobId || `bridge-${envelope.messageId}-${Date.now()}`),
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
router.post('/bridge/pair', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const bridgeId = String(parsedBody.bridgeId || '').trim();
    if (!bridgeId) {
        res.status(400).json({ ok: false, error: 'bridgeId is required' });
        return;
    }
    const requestedScopeRaw = String(parsedBody.scope || '').trim();
    const requestedScope = requestedScopeRaw || auth.scope || null;
    if (isScopeEnforced() && !requestedScope) {
        res.status(400).json({ ok: false, error: 'Scope claim is required for bridge session' });
        return;
    }
    const agentId = asOptionalString(parsedBody.agentId);
    const agentName = asOptionalString(parsedBody.agentName);
    const agentPlatform = agentId ? normalizePlatform(parsedBody.agentPlatform || 'custom') : null;
    const workspaceId = asOptionalString(parsedBody.workspaceId);
    const projectId = asOptionalString(parsedBody.projectId);
    const capabilities = asStringArray(parsedBody.capabilities);
    const normalizedCapabilities = normalizeCapabilities(parsedBody.capabilities);
    const metadata = isRecord(parsedBody.metadata)
        ? parsedBody.metadata
        : undefined;
    const durableIdentity = buildBridgeDurableIdentity({
        agentId,
        agentPlatform,
        workspaceId,
        projectId,
        scope: requestedScope,
    });
    const bindingValidation = validateBridgeSessionInput({ agentId, workspaceId, projectId });
    if (!bindingValidation.ok) {
        respondCanonicalA2AError(res, bindingValidation.status, {
            code: a2a_sdk_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: bindingValidation.error,
        });
        return;
    }
    const workspaceValidation = validateBridgeSessionWorkspaceBinding({ agentId, workspaceId, projectId });
    if (!workspaceValidation.ok) {
        respondCanonicalA2AError(res, workspaceValidation.status, {
            code: workspaceValidation.status === 403
                ? a2a_sdk_1.A2AErrorCodeEnum.AuthorizationDenied
                : workspaceValidation.status === 404
                    ? a2a_sdk_1.A2AErrorCodeEnum.TaskNotFound
                    : a2a_sdk_1.A2AErrorCodeEnum.InvalidStateTransition,
            message: workspaceValidation.error,
        });
        return;
    }
    const registryValidation = reconcileBridgeSessionRegistryBinding({
        bridgeId,
        agentId,
        agentName,
        agentPlatform,
        capabilities,
        workspaceId,
        projectId,
    });
    if (!registryValidation.ok) {
        respondCanonicalA2AError(res, registryValidation.status, {
            code: registryValidation.status === 409
                ? a2a_sdk_1.A2AErrorCodeEnum.InvalidStateTransition
                : a2a_sdk_1.A2AErrorCodeEnum.AgentNotFound,
            message: registryValidation.error,
        });
        return;
    }
    const conflictValidation = await validateBridgeSessionConflicts({
        agentId,
        agentPlatform,
        workspaceId,
        projectId,
        durableIdentity,
    });
    if (!conflictValidation.ok) {
        respondCanonicalA2AError(res, conflictValidation.status, {
            code: a2a_sdk_1.A2AErrorCodeEnum.InvalidStateTransition,
            message: conflictValidation.error,
        });
        return;
    }
    const ttlMs = Number(parsedBody.ttlMs || BRIDGE_SESSION_TTL_MS);
    const boundedTtlMs = Math.min(Math.max(ttlMs, 60 * 1000), 7 * 24 * 60 * 60 * 1000);
    const now = Date.now();
    const reuseExisting = parsedBody.reuseExisting !== false;
    const reusableSession = reuseExisting
        ? await findReusableBridgeSession({ durableIdentity })
        : null;
    const session = {
        token: reusableSession?.token || newBridgeSessionToken(),
        durableIdentity,
        bridgeId,
        scope: requestedScope,
        agentId,
        agentName,
        agentPlatform,
        workspaceId,
        projectId,
        capabilities,
        metadata,
        createdAt: reusableSession?.createdAt || new Date(now).toISOString(),
        expiresAt: new Date(now + boundedTtlMs).toISOString(),
        issuedBy: String(parsedBody.issuedBy || 'admin'),
    };
    await storeBridgeSession(session);
    const registryAgent = agentId ? (0, agent_registry_service_1.getAgentRegistryService)().getWithHealth(agentId) : undefined;
    res.status(reusableSession ? 200 : 201).json({
        ok: true,
        reused: Boolean(reusableSession),
        bridgeId: session.bridgeId,
        durableIdentity: session.durableIdentity,
        token: session.token,
        scope: session.scope || null,
        agentId: session.agentId || null,
        agentName: session.agentName || null,
        agentPlatform: session.agentPlatform || null,
        workspaceId: session.workspaceId || null,
        projectId: session.projectId || null,
        capabilities: session.capabilities || [],
        normalizedCapabilities,
        metadata: session.metadata || null,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        registry: registryAgent
            ? {
                registered: true,
                online: registryAgent.health.online,
                lastHeartbeat: registryAgent.health.lastHeartbeat,
                reconnectCount: registryAgent.lifecycle.reconnectCount,
                registrationCount: registryAgent.lifecycle.registrationCount,
            }
            : {
                registered: false,
                online: false,
                lastHeartbeat: null,
                reconnectCount: 0,
                registrationCount: 0,
            },
    });
});
router.get('/bridge/sessions', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const sessions = await listBridgeSessions();
    const sessionRows = await Promise.all(sessions.map(async (session) => {
        const registryAgent = session.agentId ? (0, agent_registry_service_1.getAgentRegistryService)().getWithHealth(session.agentId) : undefined;
        return {
            bridgeId: session.bridgeId,
            durableIdentity: session.durableIdentity,
            scope: session.scope || null,
            agentId: session.agentId || null,
            agentName: registryAgent?.identity.name || session.agentName || null,
            agentPlatform: registryAgent?.identity.platform || session.agentPlatform || null,
            workspaceId: session.workspaceId || null,
            projectId: session.projectId || null,
            issuedBy: session.issuedBy,
            capabilities: session.capabilities || [],
            normalizedCapabilities: normalizeCapabilities(session.capabilities || []),
            metadata: session.metadata || null,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            tokenPreview: `${session.token.slice(0, 8)}...`,
            heartbeat: await getBridgeHeartbeat(session.bridgeId),
            registry: registryAgent
                ? {
                    registered: true,
                    online: registryAgent.health.online,
                    lastHeartbeat: registryAgent.health.lastHeartbeat,
                    reconnectCount: registryAgent.lifecycle.reconnectCount,
                    registrationCount: registryAgent.lifecycle.registrationCount,
                }
                : {
                    registered: false,
                    online: false,
                    lastHeartbeat: '',
                },
        };
    }));
    res.status(200).json({
        ok: true,
        sessions: sessionRows,
    });
});
router.get('/bridge/jobs/next', async (req, res) => {
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
router.post('/bridge/jobs/:jobId/result', async (req, res) => {
    const auth = await verifyBridgeTokenForRequest(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
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
        result: parsedBody,
    });
    let resultEnvelope;
    if (parsedBody.resultEnvelope !== undefined) {
        const parsedResultEnvelope = parseBridgeResultEnvelopeFromUnknown(parsedBody.resultEnvelope, 'resultEnvelope');
        if (!parsedResultEnvelope.ok) {
            respondInvalidEnvelope(res, parsedResultEnvelope.issues, 'Invalid bridge result envelope');
            return;
        }
        resultEnvelope = parsedResultEnvelope.parsed;
    }
    if (resultEnvelope?.legacyEnvelope?.messageId && resultEnvelope.legacyEnvelope.threadId) {
        await dispatchIntentToBackend(resultEnvelope.legacyEnvelope);
    }
    const resultMetadata = resultEnvelope?.metadata || {};
    const resultWorkspaceId = resultEnvelope?.workspaceId || null;
    const resultTraceId = resultEnvelope?.traceId || null;
    const resultTaskId = resultEnvelope?.taskId || null;
    if (resultEnvelope?.threadId && resultTraceId && resultWorkspaceId) {
        const evidenceItems = [
            ...extractEvidencePayloadItems(parsedBody, resultTaskId || null, auth.session?.agentId || null),
            ...extractEvidencePayloadItems(resultMetadata, resultTaskId || null, auth.session?.agentId || null),
            ...extractRuntimeEvidenceItems(parsedBody, resultTaskId || null, auth.session?.agentId || null),
            ...extractRuntimeEvidenceItems(resultMetadata, resultTaskId || null, auth.session?.agentId || null),
        ];
        const approvalCheckpoints = Array.from(new Map([
            ...extractApprovalCheckpoints(parsedBody),
            ...extractApprovalCheckpoints(resultMetadata),
        ].map((approval) => [approval.approvalId, approval])).values());
        const handoffCheckpoints = Array.from(new Map([
            ...extractHandoffCheckpoints(parsedBody),
            ...extractHandoffCheckpoints(resultMetadata),
        ].map((handoff) => [handoff.handoffId, handoff])).values());
        await appendControlPlaneLifecycleEvent({
            workspaceId: resultWorkspaceId,
            threadId: resultEnvelope.threadId,
            traceId: resultTraceId,
            eventType: Boolean(parsedBody.ok) ? 'bridge.result.accepted' : 'bridge.result.failed',
            taskId: resultTaskId,
            actorId: auth.session?.agentId || null,
            detail: {
                jobId,
                bridgeId: auth.session?.bridgeId || null,
                messageId: resultEnvelope.messageId,
                envelopeShape: resultEnvelope.canonicalEnvelope ? 'task_envelope' : 'gateway_envelope',
                ok: Boolean(parsedBody.ok),
            },
        });
        await appendControlPlaneEvidence({
            workspaceId: resultWorkspaceId,
            threadId: resultEnvelope.threadId,
            traceId: resultTraceId,
            taskId: resultTaskId,
            agentId: auth.session?.agentId || null,
            evidence: evidenceItems,
        });
        for (const approval of approvalCheckpoints) {
            await appendControlPlaneLifecycleEvent({
                workspaceId: resultWorkspaceId,
                threadId: resultEnvelope.threadId,
                traceId: resultTraceId,
                eventType: approvalLifecycleEventType(approval.state),
                taskId: approval.taskId || resultTaskId,
                actorId: approval.decidedBy?.agent_id || approval.requestedBy.agent_id || auth.session?.agentId || null,
                state: approval.state,
                detail: {
                    jobId,
                    bridgeId: auth.session?.bridgeId || null,
                    approval,
                },
            });
        }
        for (const handoff of handoffCheckpoints) {
            await appendControlPlaneLifecycleEvent({
                workspaceId: resultWorkspaceId,
                threadId: resultEnvelope.threadId,
                traceId: resultTraceId,
                eventType: handoffLifecycleEventType(handoff.state),
                taskId: handoff.taskId || resultTaskId,
                actorId: handoff.from?.agent_id || handoff.to.agent_id || auth.session?.agentId || null,
                state: handoff.state,
                detail: {
                    jobId,
                    bridgeId: auth.session?.bridgeId || null,
                    handoff,
                },
            });
        }
    }
    await emitAuditEvent('bridge_result_accepted', {
        jobId,
        ok: Boolean(parsedBody.ok),
        resultMessageId: resultEnvelope?.messageId || null,
        resultThreadId: resultEnvelope?.threadId || null,
    });
    res.status(200).json({ ok: true, jobId });
});
router.get('/bridge/jobs/:jobId/result', async (req, res) => {
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
router.post('/bridge/heartbeat', async (req, res) => {
    const auth = await verifyBridgeTokenForRequest(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const bridgeId = String(req.header('x-recoder-a2a-bridge-id') || parsedBody.bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || 'default').trim();
    const payloadAgentId = asOptionalString(parsedBody.agentId);
    const payloadWorkspaceId = asOptionalString(parsedBody.workspaceId);
    const payloadProjectId = asOptionalString(parsedBody.projectId);
    const boundSession = auth.session;
    if (boundSession?.agentId && payloadAgentId && boundSession.agentId !== payloadAgentId) {
        res.status(403).json({ ok: false, error: 'Heartbeat agentId does not match paired bridge session' });
        return;
    }
    if (boundSession?.workspaceId && payloadWorkspaceId && boundSession.workspaceId !== payloadWorkspaceId) {
        res.status(403).json({ ok: false, error: 'Heartbeat workspaceId does not match paired bridge session' });
        return;
    }
    if (boundSession?.projectId && payloadProjectId && boundSession.projectId !== payloadProjectId) {
        res.status(403).json({ ok: false, error: 'Heartbeat projectId does not match paired bridge session' });
        return;
    }
    if (boundSession?.agentId) {
        const registryValidation = reconcileBridgeSessionRegistryBinding({
            bridgeId,
            agentId: boundSession.agentId,
            agentName: boundSession.agentName || null,
            agentPlatform: boundSession.agentPlatform || null,
            capabilities: boundSession.capabilities || [],
            workspaceId: boundSession.workspaceId || null,
            projectId: boundSession.projectId || null,
        });
        if (!registryValidation.ok) {
            res.status(registryValidation.status).json({ ok: false, error: registryValidation.error });
            return;
        }
    }
    if (boundSession) {
        const heartbeatCapabilities = normalizeCapabilities(parsedBody.capabilities);
        const nextSession = {
            ...boundSession,
            capabilities: heartbeatCapabilities.length > 0 ? heartbeatCapabilities : boundSession.capabilities || [],
            metadata: {
                ...(boundSession.metadata || {}),
                lastHeartbeatAt: new Date().toISOString(),
            },
        };
        await storeBridgeSession(nextSession);
    }
    const mergedPayload = {
        ...parsedBody,
        ...(boundSession?.agentId ? { agentId: boundSession.agentId } : {}),
        ...(boundSession?.workspaceId ? { workspaceId: boundSession.workspaceId } : {}),
        ...(boundSession?.projectId ? { projectId: boundSession.projectId } : {}),
        ...(boundSession?.capabilities?.length ? { sessionCapabilities: boundSession.capabilities } : {}),
    };
    await storeBridgeHeartbeat({ bridgeId, payload: mergedPayload });
    await emitAuditEvent('bridge_heartbeat', {
        bridgeId,
        agentId: boundSession?.agentId || payloadAgentId || null,
        workspaceId: boundSession?.workspaceId || payloadWorkspaceId || null,
        projectId: boundSession?.projectId || payloadProjectId || null,
        capabilities: normalizeCapabilities(parsedBody.capabilities).length > 0
            ? normalizeCapabilities(parsedBody.capabilities)
            : boundSession?.capabilities || null,
    });
    res.status(200).json({ ok: true, bridgeId });
});
router.get('/bridge/heartbeats', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const heartbeats = await listBridgeHeartbeats();
    res.status(200).json({ ok: true, heartbeats });
});
router.get('/bridge/heartbeats/:bridgeId', async (req, res) => {
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
router.get('/bridge/status', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const rows = await listBridgeHeartbeats();
    const statuses = [];
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
router.get('/audit', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const limit = Number(String(req.query.limit || '50'));
    const events = await listAuditEvents(Number.isFinite(limit) ? limit : 50);
    res.status(200).json({ ok: true, events });
});
router.get('/agents', async (req, res) => {
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
router.put('/agents/:agentId', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
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
        platform: String(parsedBody.platform || agentId),
        base_url: '',
        enabled: false,
        auth_mode: 'hmac_shared_secret',
        health: 'unknown',
        updated_at: new Date().toISOString(),
    };
    const next = {
        ...existing,
        platform: String(parsedBody.platform || existing.platform || agentId),
        base_url: String(parsedBody.base_url ?? existing.base_url ?? ''),
        enabled: asBool(parsedBody.enabled, existing.enabled),
        auth_mode: (parsedBody.auth_mode === 'none' ? 'none' : 'hmac_shared_secret'),
        health: (['unknown', 'healthy', 'unhealthy'].includes(String(parsedBody.health || ''))
            ? String(parsedBody.health)
            : existing.health),
        updated_at: new Date().toISOString(),
    };
    await upsertAgentRegistryEntry(next);
    res.status(200).json({ ok: true, agent: next });
});
router.post('/agents/test', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const agentId = String(parsedBody.agent_id || '').trim();
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
        const next = { ...agent, health: response.ok ? 'healthy' : 'unhealthy', updated_at: new Date().toISOString() };
        await upsertAgentRegistryEntry(next);
        res.status(200).json({ ok: response.ok, agent: next, status: response.status, healthUrl });
    }
    catch (error) {
        const next = { ...agent, health: 'unhealthy', updated_at: new Date().toISOString() };
        await upsertAgentRegistryEntry(next);
        res.status(502).json({ ok: false, agent: next, error: 'health_check_failed' });
    }
});
router.get('/policy', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const policy = await getOrchestrationPolicy();
    res.status(200).json({ ok: true, policy });
});
router.put('/policy', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const current = await getOrchestrationPolicy();
    const allowedIntentsInput = Array.isArray(parsedBody.allowedIntents)
        ? parsedBody.allowedIntents
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : current.allowedIntents;
    const dualApprovalIntentsInput = Array.isArray(parsedBody.requireDualApprovalIntents)
        ? parsedBody.requireDualApprovalIntents
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : current.requireDualApprovalIntents;
    const maxTargetsInput = Number(parsedBody.maxTargets ?? current.maxTargets);
    const maxDeadlineInput = Number(parsedBody.maxDeadlineMs ?? current.maxDeadlineMs);
    const next = {
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
router.post('/orchestrate', async (req, res) => {
    const auth = verifyAdminToken(req);
    if (!auth.ok) {
        res.status(auth.status).json({ ok: false, error: auth.error });
        return;
    }
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const envelopeParse = parseEnvelopeFromUnknown(parsedBody.envelope, 'envelope');
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
    const mode = normalizeMode(parsedBody.mode || envelope?.metadata?.executionMode);
    const primaryAgent = String(parsedBody.primaryAgent || '');
    const fallbackAgent = String(parsedBody.fallbackAgent || '');
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
        respondCanonicalA2AError(res, 409, {
            code: a2a_sdk_1.A2AErrorCodeEnum.AgentNotFound,
            message: 'No available agents for requested mode',
            detail: { mode },
        });
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
        respondCanonicalA2AError(res, policy.status, {
            code: policy.status === 409
                ? a2a_sdk_1.A2AErrorCodeEnum.InvalidStateTransition
                : a2a_sdk_1.A2AErrorCodeEnum.PolicyDenied,
            message: policy.error,
            detail: { mode, intent: envelope.intent },
        });
        return;
    }
    const endpointByAgent = {
        codex: codex?.base_url || '',
        claude_code: claude?.base_url || '',
    };
    const bridgeIdFromRequest = String(parsedBody.bridgeId || process.env.RECODER_A2A_BRIDGE_DEFAULT_ID || '').trim();
    const bridgeEnabled = Boolean(bridgeIdFromRequest) || process.env.RECODER_A2A_ENABLE_BRIDGE_FALLBACK === 'true';
    const bridgeId = bridgeIdFromRequest || 'default';
    const traceId = String(envelope?.metadata?.traceId || '') ||
        String(parsedBody.traceId || '') ||
        `trace-${envelope.messageId}`;
    const workspaceId = readMetadataWorkspaceId(envelope.metadata) || 'global';
    const results = [];
    for (const agentId of selected) {
        const startedAt = Date.now();
        const baseUrl = endpointByAgent[agentId];
        if (baseUrl.startsWith('bridge://')) {
            const routedBridgeId = baseUrl.slice('bridge://'.length).trim() || bridgeId;
            const bridgeJob = {
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
            if (mode === 'fallback' || mode === 'codex_only' || mode === 'claude_only')
                break;
            continue;
        }
        if (!baseUrl) {
            if (bridgeEnabled && (agentId === 'codex' || agentId === 'claude_code')) {
                const bridgeJob = {
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
                if (mode === 'fallback' || mode === 'codex_only' || mode === 'claude_only')
                    break;
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
            if (mode === 'fallback')
                continue;
            if (mode !== 'parallel')
                break;
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
            if (mode === 'fallback' && result.ok)
                break;
            if (mode === 'codex_only' || mode === 'claude_only')
                break;
        }
        catch (error) {
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
            if (mode !== 'parallel')
                continue;
        }
    }
    const merge = computeDeterministicMerge({ mode, results, primaryAgent });
    const anySuccess = results.some((row) => Boolean(row.ok));
    await persistOrchestrationState({
        workspaceId,
        threadId: envelope.threadId,
        traceId,
        mode,
        targets: selected,
        results,
        merge,
        overrideHistory: [],
        scope: effectiveScope.scope,
        lifecycle: [
            {
                id: `lifecycle-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                at: new Date().toISOString(),
                eventType: 'orchestration.started',
                workspaceId,
                threadId: envelope.threadId,
                traceId,
                taskId: asOptionalString((envelope.metadata || {}).taskId) || null,
                actorId: envelope.from.id,
                state: 'submitted',
                detail: {
                    mode,
                    targets: selected,
                    messageId: envelope.messageId,
                    intent: envelope.intent,
                },
            },
            {
                id: `lifecycle-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                at: new Date().toISOString(),
                eventType: anySuccess ? 'orchestration.completed' : 'orchestration.failed',
                workspaceId,
                threadId: envelope.threadId,
                traceId,
                taskId: asOptionalString((envelope.metadata || {}).taskId) || null,
                actorId: envelope.from.id,
                state: anySuccess ? 'working' : 'failed',
                detail: {
                    selected,
                    mergeWinner: merge ? merge.winnerAgentId || null : null,
                    success: anySuccess,
                },
            },
        ],
    });
    await emitAuditEvent('orchestrate_completed', {
        mode,
        messageId: envelope.messageId,
        threadId: envelope.threadId,
        traceId,
        selected,
        success: anySuccess,
        mergeWinner: merge ? merge.winnerAgentId : null,
    });
    await publishOrchestrationHistoryUpdate({
        threadId: envelope.threadId,
        traceId,
        eventType: 'orchestration_completed',
        detail: {
            mode,
            selected,
            mergeWinner: merge ? merge.winnerAgentId : null,
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
router.get('/orchestrate/:threadId/:traceId', async (req, res) => {
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
router.get('/orchestrate/:threadId/:traceId/history', async (req, res) => {
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
router.get('/orchestrate/:threadId/:traceId/history/stream', async (req, res) => {
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
    }
    else if (isScopeEnforced()) {
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
    if (typeof res.flushHeaders === 'function')
        res.flushHeaders();
    const eventTypesRaw = String(req.query.eventTypes || '').trim();
    const eventTypes = eventTypesRaw
        ? new Set(eventTypesRaw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean))
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
        }
        catch {
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
        if (!redisEvents || redisEvents.length === 0)
            return;
        for (const event of redisEvents) {
            if (!shouldDeliverHistoryEvent(subscriber, event)) {
                subscriber.lastEventId = event.id;
                continue;
            }
            try {
                writeSseEvent(res, 'history_update', {
                    eventType: event.eventType,
                    at: event.at,
                    threadId: event.threadId,
                    traceId: event.traceId,
                    detail: event.detail,
                    history: event.history,
                }, event.id);
                subscriber.lastEventId = event.id;
            }
            catch {
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
router.post('/orchestrate/:threadId/:traceId/override', async (req, res) => {
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
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const winnerAgentId = String(parsedBody.winnerAgentId || '').trim();
    const overrideReason = String(parsedBody.reason || '').trim();
    const overrideBy = String(parsedBody.overrideBy || 'admin').trim();
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
    const merge = (state.merge || null);
    if (!merge) {
        res.status(409).json({ ok: false, error: 'No merge decision exists for this orchestration' });
        return;
    }
    const candidates = Array.isArray(merge.candidates) ? merge.candidates : [];
    const winnerCandidate = candidates.find((candidate) => String(candidate.agentId || '') === winnerAgentId);
    if (!winnerCandidate) {
        res.status(400).json({ ok: false, error: `winnerAgentId '${winnerAgentId}' is not in merge candidates` });
        return;
    }
    const mergedConflictReasons = Array.isArray(merge.conflictReasons)
        ? [...merge.conflictReasons, 'manual_override']
        : ['manual_override'];
    const previousWinnerAgentId = (() => {
        const current = merge.winnerAgentId;
        if (current === null || current === undefined || current === '')
            return null;
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
    const overrideHistory = extractOverrideHistoryFromState(state);
    const nextOverrideHistory = overrideHistory.concat({
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
            ...state,
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
router.post('/orchestrate/:threadId/:traceId/recompute', async (req, res) => {
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
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
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
    const mode = normalizeMode(state.mode || 'parallel');
    const primaryAgent = String((parsedBody?.primaryAgent ?? state?.primaryAgent ?? '') || '');
    const results = extractResultsFromState(state);
    const overrideHistory = extractOverrideHistoryFromState(state);
    const recomputed = computeDeterministicMerge({ mode, results, primaryAgent });
    if (!recomputed) {
        res.status(409).json({ ok: false, error: 'Unable to recompute merge for this orchestration mode/results' });
        return;
    }
    await upsertOrchestrationStateRecord({
        threadId,
        traceId,
        state: {
            ...state,
            merge: recomputed,
            primaryAgent,
        },
    });
    await emitAuditEvent('orchestrate_merge_recomputed', {
        threadId,
        traceId,
        mode,
        primaryAgent: primaryAgent || null,
        winnerAgentId: recomputed.winnerAgentId || null,
    });
    await publishOrchestrationHistoryUpdate({
        threadId,
        traceId,
        eventType: 'merge_recomputed',
        detail: {
            winnerAgentId: recomputed.winnerAgentId || null,
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
router.post('/intents/:intent', async (req, res) => {
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
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid JSON body' });
        return;
    }
    const bodyIntent = String(parsedBody.intent || '');
    if (bodyIntent && bodyIntent !== intent) {
        res.status(400).json({ ok: false, error: 'Intent mismatch between path and body' });
        return;
    }
    const envelope = (parsedBody.envelope || {});
    const executorUrl = resolveIntentExecutor(intent);
    let executor = { executed: false, reason: 'no_executor_configured' };
    if (executorUrl) {
        try {
            const response = await fetch(executorUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent, source: 'a2a-intent-handler', payload: parsedBody }),
            });
            executor = { executed: response.ok, status: response.status, url: executorUrl };
        }
        catch (error) {
            executor = { executed: false, error: String(error?.message || 'executor_failed'), url: executorUrl };
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
router.post('/envelope', async (req, res) => {
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
        respondCanonicalA2AError(res, verification.status, {
            code: verification.status === 401
                ? a2a_sdk_1.A2AErrorCodeEnum.AuthenticationFailed
                : verification.status === 403
                    ? a2a_sdk_1.A2AErrorCodeEnum.AuthorizationDenied
                    : (0, a2a_sdk_1.mapHttpError)(verification.status, verification.error).code,
            message: verification.error,
        });
        return;
    }
    let envelope;
    try {
        const parsed = JSON.parse(rawBody);
        const parsedEnvelope = parseEnvelopeFromUnknown(parsed, 'body');
        if (!parsedEnvelope.ok) {
            respondInvalidEnvelope(res, parsedEnvelope.issues);
            return;
        }
        envelope = parsedEnvelope.envelope;
    }
    catch {
        respondCanonicalA2AError(res, 400, {
            code: a2a_sdk_1.A2AErrorCodeEnum.InvalidPayload,
            message: 'Invalid JSON body',
        });
        return;
    }
    const idempotency = await checkAndStoreEnvelopeIdempotency(envelope);
    if (!idempotency.accepted) {
        respondCanonicalA2AError(res, 400, {
            code: a2a_sdk_1.A2AErrorCodeEnum.MissingEnvelopeField,
            message: 'messageId is required',
        });
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
router.post('/dispatch', async (req, res) => {
    const parsedBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body);
            }
            catch {
                return null;
            }
        })()
        : req.body;
    if (!parsedBody || typeof parsedBody !== 'object') {
        respondCanonicalA2AError(res, 400, {
            code: a2a_sdk_1.A2AErrorCodeEnum.InvalidPayload,
            message: 'Invalid JSON body',
        });
        return;
    }
    const targetUrl = String(parsedBody.targetUrl || '').trim();
    if (!targetUrl) {
        respondCanonicalA2AError(res, 400, {
            code: a2a_sdk_1.A2AErrorCodeEnum.MissingEnvelopeField,
            message: 'targetUrl is required',
        });
        return;
    }
    const envelopeParse = parseEnvelopeFromUnknown(parsedBody.envelope, 'envelope');
    if (!envelopeParse.ok) {
        respondInvalidEnvelope(res, envelopeParse.issues);
        return;
    }
    const envelope = envelopeParse.envelope;
    if (!isAllowedTarget(targetUrl)) {
        respondCanonicalA2AError(res, 403, {
            code: a2a_sdk_1.A2AErrorCodeEnum.AuthorizationDenied,
            message: 'targetUrl not in egress allowlist',
        });
        return;
    }
    const secret = process.env.RECODER_A2A_SHARED_SECRET || '';
    if (!secret) {
        respondCanonicalA2AError(res, 503, {
            code: a2a_sdk_1.A2AErrorCodeEnum.ConfigurationError,
            message: 'RECODER_A2A_SHARED_SECRET is not configured',
        });
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
function getDockerBackendAgentCard(baseUrl) {
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
async function __createSignatureForTest(timestamp, rawBody, secret) {
    return hmacHex(secret, `${timestamp}.${rawBody}`);
}
function __resetA2ATestState() {
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
    (0, workspace_service_1.resetWorkspaceService)();
    (0, agent_registry_service_1.resetAgentRegistryService)();
}
exports.__testSelectTargets = selectTargets;
