import type { ValidationIssue } from './validation';
import { normalizeInboundEnvelope } from './ingress';
import {
  adaptLegacyEnvelopeToTaskEnvelope,
  type AdaptLegacyEnvelopeOptions,
  type LegacyInboundEnvelope,
} from './envelope-adapters';
import type { TaskEnvelope } from './schemas/task-envelope';

const RECODER_A2A_ENVELOPE_VERSION = '2026-02-14';
const RECODER_A2A_PROTOCOL_VERSION = '0.3.0';

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

export interface NormalizeLegacyInboundEnvelopeOptions
  extends AdaptLegacyEnvelopeOptions {
  sourcePath?: string;
  strictVersion?: boolean;
}

export type NormalizeLegacyInboundEnvelopeResult =
  | { ok: true; envelope: TaskEnvelope; legacyEnvelope: LegacyInboundEnvelope }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizePlatform(value: unknown): LegacyInboundEnvelope['from']['platform'] {
  const platform = asString(value).trim();
  if (VALID_RECORDER_PLATFORMS.has(platform)) {
    return platform;
  }
  return 'custom';
}

function prefixIssues(
  issues: ValidationIssue[],
  sourcePath: string | undefined,
): ValidationIssue[] {
  if (!sourcePath) {
    return issues;
  }

  return issues.map((issue) => ({
    ...issue,
    path:
      issue.path === '$'
        ? sourcePath
        : `${sourcePath}${issue.path.startsWith('[') ? '' : '.'}${issue.path}`,
  }));
}

export function normalizeLegacyInboundEnvelope(
  value: unknown,
  options: NormalizeLegacyInboundEnvelopeOptions,
): NormalizeLegacyInboundEnvelopeResult {
  const sourcePath = options.sourcePath ?? 'envelope';
  let candidate: unknown = value;

  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value);
    } catch {
      return {
        ok: false,
        issues: [{ path: sourcePath, message: 'invalid JSON: request body could not be parsed' }],
      };
    }
  }

  const issues: ValidationIssue[] = [];
  if (!isRecord(candidate)) {
    return { ok: false, issues: [{ path: sourcePath, message: 'must be an object' }] };
  }

  const messageId = asString(candidate.messageId).trim();
  const threadId = asString(candidate.threadId).trim();
  const intent = asString(candidate.intent).trim();
  if (!messageId) {
    issues.push({ path: `${sourcePath}.messageId`, message: 'must be a non-empty string' });
  }
  if (!threadId) {
    issues.push({ path: `${sourcePath}.threadId`, message: 'must be a non-empty string' });
  }
  if (!intent || !VALID_RECORDER_INTENTS.has(intent)) {
    issues.push({
      path: `${sourcePath}.intent`,
      message:
        'must be one of plan, execute, review, handoff, status, sync, tool_call, tool_result, error',
    });
  }

  const fromInput = candidate.from;
  const toInput = candidate.to;
  if (!isRecord(fromInput)) {
    issues.push({ path: `${sourcePath}.from`, message: 'must be an object' });
  }
  if (!isRecord(toInput)) {
    issues.push({ path: `${sourcePath}.to`, message: 'must be an object' });
  }

  const fromId = isRecord(fromInput) ? asString(fromInput.id).trim() : '';
  const toId = isRecord(toInput) ? asString(toInput.id).trim() : '';
  if (!fromId) {
    issues.push({ path: `${sourcePath}.from.id`, message: 'must be a non-empty string' });
  }
  if (!toId) {
    issues.push({ path: `${sourcePath}.to.id`, message: 'must be a non-empty string' });
  }

  const payloadInput = candidate.payload;
  if (!Array.isArray(payloadInput)) {
    issues.push({ path: `${sourcePath}.payload`, message: 'must be an array' });
  }

  const createdAtInput = asString(candidate.createdAt).trim();
  const createdAt = createdAtInput || new Date().toISOString();
  if (createdAtInput && Number.isNaN(Date.parse(createdAtInput))) {
    issues.push({
      path: `${sourcePath}.createdAt`,
      message: 'must be a valid ISO-8601 timestamp string',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const fromRecord = fromInput as Record<string, unknown>;
  const toRecord = toInput as Record<string, unknown>;
  const metadata = isRecord(candidate.metadata) ? candidate.metadata : undefined;
  const traceRaw = candidate.trace;
  const trace =
    isRecord(traceRaw) && asString(traceRaw.traceId).trim()
      ? {
          traceId: asString(traceRaw.traceId).trim(),
          parentMessageId: asString(traceRaw.parentMessageId).trim() || undefined,
        }
      : undefined;

  const legacyEnvelope: LegacyInboundEnvelope = {
    envelopeVersion:
      asString(candidate.envelopeVersion).trim() || RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion:
      asString(candidate.protocolVersion).trim() || RECODER_A2A_PROTOCOL_VERSION,
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
  };

  const canonicalCandidate = adaptLegacyEnvelopeToTaskEnvelope(legacyEnvelope, options);
  const normalized = normalizeInboundEnvelope(canonicalCandidate, {
    strictVersion: options.strictVersion,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      issues: prefixIssues(normalized.issues, sourcePath),
    };
  }

  return { ok: true, envelope: normalized.envelope, legacyEnvelope };
}
