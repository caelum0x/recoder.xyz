/**
 * @module a2a/data-hygiene
 *
 * Shared retention/redaction helpers for A2A in-memory records.
 */

const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_MATCHERS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /api[-_]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /credential/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_MATCHERS.some((matcher) => matcher.test(key));
}

export function redactSensitiveData<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as T;
  }

  if (isPlainObject(input)) {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_VALUE;
      } else {
        output[key] = redactSensitiveData(value);
      }
    }
    return output as T;
  }

  return input;
}

export interface RetentionWindowConfig {
  contextTtlMs: number;
  eventTtlMs: number;
  auditTtlMs: number;
  eventMaxRecords: number;
  auditMaxRecords: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getA2ARetentionWindowConfig(): RetentionWindowConfig {
  return {
    contextTtlMs: parsePositiveInt(process.env.RECODER_A2A_CONTEXT_TTL_MS, 60 * 60 * 1000),
    eventTtlMs: parsePositiveInt(process.env.RECODER_A2A_EVENT_RETENTION_MS, 24 * 60 * 60 * 1000),
    auditTtlMs: parsePositiveInt(process.env.RECODER_A2A_AUDIT_RETENTION_MS, 30 * 24 * 60 * 60 * 1000),
    eventMaxRecords: parsePositiveInt(process.env.RECODER_A2A_EVENT_MAX_RECORDS, 5000),
    auditMaxRecords: parsePositiveInt(process.env.RECODER_A2A_AUDIT_MAX_RECORDS, 10000),
  };
}
