/**
 * xdr/parser.ts — turn raw Envoy JSON access-log lines into normalized
 * NetworkSecurityEvent records.
 *
 * The data plane writes one JSON object per request (json_format in
 * envoy-config.ts ACCESS_LOG_JSON_FORMAT). This parser is tolerant: it skips
 * blank lines and unparseable lines (returning them as parse errors the caller
 * can surface) but never throws on a single bad line, so a poisoned log entry
 * cannot stall the security pipeline.
 */
import type { NetworkSecurityEvent } from '../types';

export interface ParseResult {
  readonly events: readonly NetworkSecurityEvent[];
  /** Line numbers (1-based) that failed to parse, for observability. */
  readonly errors: readonly { readonly line: number; readonly reason: string }[];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0 && value !== '-') return value;
  return undefined;
}

/** Parse a single JSON access-log object into a NetworkSecurityEvent. */
export function parseAccessLogObject(obj: Record<string, unknown>): NetworkSecurityEvent | null {
  const responseCode = asNumber(obj.response_code);
  // A record with no response code is not a usable security event.
  if (responseCode === undefined) return null;

  return {
    timestamp: asString(obj.timestamp) ?? new Date(0).toISOString(),
    method: asString(obj.method) ?? 'UNKNOWN',
    path: asString(obj.path) ?? '/',
    responseCode,
    sourceIp: asString(obj.source_ip) ?? 'unknown',
    principal: asString(obj.principal),
    upstream: asString(obj.upstream),
    bytesSent: asNumber(obj.bytes_sent),
    durationMs: asNumber(obj.duration_ms),
    responseFlags: asString(obj.response_flags),
  };
}

/** Parse a full access-log buffer (one JSON object per line). */
export function parseAccessLog(raw: string): ParseResult {
  const events: NetworkSecurityEvent[] = [];
  const errors: { line: number; reason: string }[] = [];

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      errors.push({ line: i + 1, reason: 'invalid JSON' });
      continue;
    }

    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push({ line: i + 1, reason: 'not a JSON object' });
      continue;
    }

    const event = parseAccessLogObject(obj as Record<string, unknown>);
    if (event === null) {
      errors.push({ line: i + 1, reason: 'missing response_code' });
      continue;
    }
    events.push(event);
  }

  return { events, errors };
}
