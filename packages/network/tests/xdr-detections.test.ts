import { describe, it, expect } from 'vitest';
import { detect, makeDetectionConfig } from '../src/xdr/detections';
import { XdrSink } from '../src/xdr/sink';
import type { NetworkSecurityEvent } from '../src/types';
import { newGovernanceAuditSink } from './governance-ports';

const KNOWN = 'spiffe://recoder.xyz/svc/docker-backend';

function ev(over: Partial<NetworkSecurityEvent>): NetworkSecurityEvent {
  return {
    timestamp: '2026-06-28T00:00:00.000Z',
    method: 'GET',
    path: '/docker-backend/api',
    responseCode: 200,
    sourceIp: '10.0.0.5',
    ...over,
  };
}

function at(ms: number): string {
  return new Date(Date.parse('2026-06-28T00:00:00.000Z') + ms).toISOString();
}

// --- (a) anomalous_principal -------------------------------------------------

describe('XDR (a) anomalous_principal', () => {
  const config = makeDetectionConfig({ knownPrincipals: [KNOWN] });

  it('FIRES on a request from an unknown mTLS principal', () => {
    const events = [
      ev({ principal: KNOWN }),
      ev({ principal: 'spiffe://evil/attacker', sourceIp: '203.0.113.9' }),
    ];
    const d = detect(events, config).find((x) => x.ruleId === 'anomalous_principal');
    expect(d).toBeDefined();
    expect(d!.subject).toBe('spiffe://evil/attacker');
    expect(d!.severity).toBe('medium');
  });

  it('does NOT fire when all principals are known (benign)', () => {
    const events = [ev({ principal: KNOWN }), ev({ principal: KNOWN })];
    expect(detect(events, config).filter((x) => x.ruleId === 'anomalous_principal')).toHaveLength(0);
  });

  it('does NOT fire for anonymous (no-principal) traffic', () => {
    const events = [ev({}), ev({})];
    expect(detect(events, config).filter((x) => x.ruleId === 'anomalous_principal')).toHaveLength(0);
  });

  it('is DISABLED (no detection) when no known set is configured', () => {
    const events = [ev({ principal: 'spiffe://evil/attacker' })];
    expect(detect(events).filter((x) => x.ruleId === 'anomalous_principal')).toHaveLength(0);
  });

  it('escalates to high when an unknown principal makes many requests', () => {
    const events = Array.from({ length: 6 }, () => ev({ principal: 'spiffe://evil/x' }));
    const d = detect(events, config).find((x) => x.ruleId === 'anomalous_principal');
    expect(d!.severity).toBe('high');
    expect(d!.eventCount).toBe(6);
  });
});

// --- (c) unexpected_egress ---------------------------------------------------

describe('XDR (c) unexpected_egress', () => {
  const config = makeDetectionConfig({ egressAllowlist: ['docker-backend', 'recoder-app'] });

  it('FIRES when a request egresses to a non-allowlisted destination', () => {
    const events = [
      ev({ upstream: 'docker-backend' }),
      ev({ upstream: 'attacker-c2.example.com', sourceIp: '10.0.0.9' }),
    ];
    const d = detect(events, config).find((x) => x.ruleId === 'unexpected_egress');
    expect(d).toBeDefined();
    expect(d!.subject).toBe('attacker-c2.example.com');
  });

  it('does NOT fire when every destination is allowlisted (benign)', () => {
    const events = [ev({ upstream: 'docker-backend' }), ev({ upstream: 'recoder-app' })];
    expect(detect(events, config).filter((x) => x.ruleId === 'unexpected_egress')).toHaveLength(0);
  });

  it('does NOT fire for events with no resolved upstream', () => {
    const events = [ev({}), ev({})];
    expect(detect(events, config).filter((x) => x.ruleId === 'unexpected_egress')).toHaveLength(0);
  });

  it('is DISABLED when no allowlist is configured', () => {
    const events = [ev({ upstream: 'anything-at-all' })];
    expect(detect(events).filter((x) => x.ruleId === 'unexpected_egress')).toHaveLength(0);
  });
});

// --- (d) auth_failure_spike (windowed) ---------------------------------------

describe('XDR (d) auth_failure_spike', () => {
  const config = makeDetectionConfig({
    authFailureSpikeThreshold: 5,
    authFailureSpikeWindowMs: 10_000,
    // Raise the cumulative rule out of the way so we isolate the windowed rule.
    repeatedAuthFailureThreshold: 1000,
  });

  it('FIRES when 5+ auth failures occur inside the time window', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ responseCode: 401, timestamp: at(i * 1000) }),
    );
    const d = detect(events, config).find((x) => x.ruleId === 'auth_failure_spike');
    expect(d).toBeDefined();
    expect(d!.eventCount).toBe(5);
    expect(d!.subject).toBe('10.0.0.5');
  });

  it('does NOT fire when the same failures are spread BEYOND the window', () => {
    // 5 failures, each 5s apart => spans 20s, only 3 ever fit in a 10s window.
    const events = Array.from({ length: 5 }, (_, i) =>
      ev({ responseCode: 401, timestamp: at(i * 5000) }),
    );
    const d = detect(events, config).find((x) => x.ruleId === 'auth_failure_spike');
    expect(d).toBeUndefined();
  });

  it('does NOT fire on clean (200) traffic', () => {
    const events = Array.from({ length: 20 }, (_, i) => ev({ timestamp: at(i * 100) }));
    expect(detect(events, config).filter((x) => x.ruleId === 'auth_failure_spike')).toHaveLength(0);
  });

  it('attributes the spike per-source (two IPs do not pool)', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, i) => ev({ responseCode: 401, sourceIp: '10.0.0.1', timestamp: at(i * 500) })),
      ...Array.from({ length: 3 }, (_, i) => ev({ responseCode: 401, sourceIp: '10.0.0.2', timestamp: at(i * 500) })),
    ];
    expect(detect(events, config).filter((x) => x.ruleId === 'auth_failure_spike')).toHaveLength(0);
  });
});

// --- Sink sealing for the new detections -------------------------------------

describe('XdrSink seals the new detections into the Merkle audit chain', () => {
  it('(a) anomalous_principal is sealed with a chain hash and verifies', () => {
    const audit = newGovernanceAuditSink();
    const sink = new XdrSink(audit, { config: makeDetectionConfig({ knownPrincipals: [KNOWN] }) });
    const events = [ev({ principal: 'spiffe://evil/attacker' })];
    const result = sink.ingestEvents(events);
    const d = result.detections.find((x) => x.ruleId === 'anomalous_principal');
    expect(d).toBeDefined();
    expect(d!.auditHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sink.verifyChain().ok).toBe(true);
    // The detection is queryable from the retained feed.
    expect(sink.all().some((x) => x.ruleId === 'anomalous_principal')).toBe(true);
  });

  it('(c) unexpected_egress is written to the audit sink', () => {
    const audit = newGovernanceAuditSink();
    const sink = new XdrSink(audit, { config: makeDetectionConfig({ egressAllowlist: ['docker-backend'] }) });
    const tip0 = sink.auditTip();
    const result = sink.ingestEvents([ev({ upstream: 'attacker-c2' })]);
    expect(result.detections.some((x) => x.ruleId === 'unexpected_egress')).toBe(true);
    // Sealing advanced the Merkle tip => the detection is in the chain.
    expect(sink.auditTip()).not.toBe(tip0);
    expect(sink.verifyChain().ok).toBe(true);
  });

  it('(d) auth_failure_spike is sealed and the chain stays intact', () => {
    const audit = newGovernanceAuditSink();
    const sink = new XdrSink(audit, {
      config: makeDetectionConfig({
        authFailureSpikeThreshold: 5,
        authFailureSpikeWindowMs: 10_000,
        repeatedAuthFailureThreshold: 1000,
      }),
    });
    const events = Array.from({ length: 5 }, (_, i) => ev({ responseCode: 403, timestamp: at(i * 1000) }));
    const result = sink.ingestEvents(events);
    const d = result.detections.find((x) => x.ruleId === 'auth_failure_spike');
    expect(d).toBeDefined();
    expect(d!.auditHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sink.verifyChain().ok).toBe(true);
  });

  it('benign traffic seals NOTHING (empty chain stays at genesis)', () => {
    const audit = newGovernanceAuditSink();
    const sink = new XdrSink(audit, {
      config: makeDetectionConfig({ knownPrincipals: [KNOWN], egressAllowlist: ['docker-backend'] }),
    });
    const events = Array.from({ length: 10 }, () =>
      ev({ principal: KNOWN, upstream: 'docker-backend' }),
    );
    const result = sink.ingestEvents(events);
    expect(result.detections).toHaveLength(0);
    expect(sink.recent()).toHaveLength(0);
    expect(sink.verifyChain().ok).toBe(true);
  });
});
