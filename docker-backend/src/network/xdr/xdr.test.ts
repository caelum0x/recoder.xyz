import { describe, it, expect } from 'vitest';
import { parseAccessLog } from './parser';
import { detect, DEFAULT_DETECTION_CONFIG } from './detections';
import { XdrSink } from './sink';
import type { NetworkSecurityEvent } from '../types';

function logLine(over: Partial<Record<string, unknown>>): string {
  return JSON.stringify({
    timestamp: '2026-06-28T00:00:00.000Z',
    method: 'GET',
    path: '/docker-backend/api',
    response_code: 200,
    response_flags: '-',
    source_ip: '10.0.0.5',
    principal: '-',
    upstream: 'docker-backend',
    bytes_sent: 120,
    duration_ms: 4,
    ...over,
  });
}

describe('parseAccessLog', () => {
  it('parses well-formed JSON lines into security events', () => {
    const raw = [logLine({}), logLine({ response_code: 403 })].join('\n');
    const { events, errors } = parseAccessLog(raw);
    expect(events).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(events[1].responseCode).toBe(403);
  });

  it('tolerates blank lines and reports unparseable lines without throwing', () => {
    const raw = ['', logLine({}), 'not json', '{"no":"code"}'].join('\n');
    const { events, errors } = parseAccessLog(raw);
    expect(events).toHaveLength(1);
    expect(errors.map((e) => e.reason)).toContain('invalid JSON');
    expect(errors.map((e) => e.reason)).toContain('missing response_code');
  });

  it("normalizes Envoy's '-' empty sentinels to undefined", () => {
    const { events } = parseAccessLog(logLine({ principal: '-' }));
    expect(events[0].principal).toBeUndefined();
  });
});

describe('detect', () => {
  it('returns NO detections for a clean stream', () => {
    const raw = Array.from({ length: 20 }, () => logLine({})).join('\n');
    const { events } = parseAccessLog(raw);
    expect(detect(events)).toHaveLength(0);
  });

  it('detects an ext_authz denial burst (UAEX 403) from one source', () => {
    const raw = Array.from({ length: 6 }, () =>
      logLine({ response_code: 403, response_flags: 'UAEX' }),
    ).join('\n');
    const { events } = parseAccessLog(raw);
    const detections = detect(events);
    const burst = detections.find((d) => d.ruleId === 'authz_denial_burst');
    expect(burst).toBeDefined();
    expect(burst!.subject).toBe('10.0.0.5');
    expect(burst!.eventCount).toBe(6);
    expect(burst!.sampleEvents.length).toBeLessThanOrEqual(DEFAULT_DETECTION_CONFIG.maxSampleEvents);
  });

  it('detects repeated auth failures (mixed 401/403)', () => {
    const raw = [
      ...Array.from({ length: 3 }, () => logLine({ response_code: 401 })),
      ...Array.from({ length: 2 }, () => logLine({ response_code: 403 })),
    ].join('\n');
    const { events } = parseAccessLog(raw);
    const d = detect(events).find((x) => x.ruleId === 'repeated_auth_failure');
    expect(d).toBeDefined();
    expect(d!.eventCount).toBe(5);
  });

  it('detects denied egress (NR / no-route response flag)', () => {
    const raw = Array.from({ length: 3 }, () =>
      logLine({ response_code: 404, response_flags: 'NR' }),
    ).join('\n');
    const { events } = parseAccessLog(raw);
    const d = detect(events).find((x) => x.ruleId === 'denied_egress');
    expect(d).toBeDefined();
  });

  it('detects an anomalous request rate from one source', () => {
    const events: NetworkSecurityEvent[] = Array.from({ length: 100 }, () => ({
      timestamp: '2026-06-28T00:00:00.000Z',
      method: 'GET',
      path: '/x',
      responseCode: 200,
      sourceIp: '203.0.113.9',
    }));
    const d = detect(events).find((x) => x.ruleId === 'anomalous_rate');
    expect(d).toBeDefined();
    expect(d!.subject).toBe('203.0.113.9');
  });

  it('attributes detections per-source (two IPs do not pool)', () => {
    const raw = [
      ...Array.from({ length: 4 }, () => logLine({ source_ip: '10.0.0.1', response_code: 403, response_flags: 'UAEX' })),
      ...Array.from({ length: 4 }, () => logLine({ source_ip: '10.0.0.2', response_code: 403, response_flags: 'UAEX' })),
    ].join('\n');
    const { events } = parseAccessLog(raw);
    // 4 each, below the threshold of 5 -> no burst detection.
    expect(detect(events).filter((d) => d.ruleId === 'authz_denial_burst')).toHaveLength(0);
  });
});

describe('XdrSink', () => {
  it('seals detections into the Merkle audit chain and keeps it intact', () => {
    const sink = new XdrSink();
    const raw = Array.from({ length: 6 }, () =>
      logLine({ response_code: 403, response_flags: 'UAEX' }),
    ).join('\n');

    const result = sink.ingest(raw);
    expect(result.eventsParsed).toBe(6);
    expect(result.detections.length).toBeGreaterThan(0);
    // Every sealed detection carries the chain hash it was sealed under.
    for (const d of result.detections) {
      expect(d.auditHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(sink.verifyChain().ok).toBe(true);
    expect(sink.auditTip()).toBe(result.auditTip);
  });

  it('a clean stream produces no detections and an empty (genesis) chain', () => {
    const sink = new XdrSink();
    const raw = Array.from({ length: 10 }, () => logLine({})).join('\n');
    const result = sink.ingest(raw);
    expect(result.detections).toHaveLength(0);
    expect(sink.recent()).toHaveLength(0);
    expect(sink.verifyChain().ok).toBe(true);
  });

  it('advances the Merkle tip across ingest batches', () => {
    const sink = new XdrSink();
    const raw = Array.from({ length: 6 }, () =>
      logLine({ response_code: 403, response_flags: 'UAEX' }),
    ).join('\n');
    const tip0 = sink.auditTip();
    sink.ingest(raw);
    const tip1 = sink.auditTip();
    expect(tip1).not.toBe(tip0);
  });
});
