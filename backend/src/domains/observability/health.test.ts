/**
 * observabilityHealth — the module's OWN truthful-degrade rollup (ARCHITECTURE
 * §10.1). The load-bearing invariant: a DOWN engine (e.g. the signals sidecar
 * absent) is NEVER folded up as healthy — the module reports `degraded` with a
 * reason naming the impaired engine. All `up` → `up`; any `degraded`/`unknown`/
 * `degraded:true` engine → `degraded`; per-engine truth is always preserved.
 */
import { describe, it, expect } from 'vitest';
import { observabilityHealth } from './health.js';
import type { EngineHealth } from './types.js';

const allUp: readonly EngineHealth[] = [
  { engine: 'logging', status: 'up', degraded: false },
  { engine: 'metrics', status: 'up', degraded: false },
  { engine: 'tracing', status: 'up', degraded: false },
  { engine: 'signals', status: 'up', degraded: false },
  { engine: 'audit', status: 'up', degraded: false },
];

describe('observabilityHealth', () => {
  it('all engines up → module up, not degraded', () => {
    const h = observabilityHealth(allUp);
    expect(h.name).toBe('observability');
    expect(h.status).toBe('up');
    expect(h.degraded).toBe(false);
    expect(h.reason).toBeUndefined();
    expect(h.engines).toHaveLength(5);
  });

  it('a DOWN engine is never masked green — module reports degraded (never down as a whole)', () => {
    const engines: readonly EngineHealth[] = [
      { engine: 'logging', status: 'up', degraded: false },
      { engine: 'metrics', status: 'up', degraded: false },
      { engine: 'signals', status: 'down', degraded: false, reason: 'sidecar/venv absent' },
    ];
    const h = observabilityHealth(engines);
    // truthfulness gate: a down dependency is NOT reported healthy
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
    // module is never `down` as a whole — its live surfaces stay up
    expect(h.status).not.toBe('down');
    expect(h.reason).toContain('signals: down');
    expect(h.reason).toContain('sidecar/venv absent');
  });

  it('a degraded engine (status) → module degraded', () => {
    const engines: readonly EngineHealth[] = [
      { engine: 'metrics', status: 'up', degraded: false },
      { engine: 'audit', status: 'degraded', degraded: true, reason: 'last verify degraded' },
    ];
    const h = observabilityHealth(engines);
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
    expect(h.reason).toContain('audit: degraded');
  });

  it('an up-but-impaired engine (degraded:true flag) still degrades the module', () => {
    // tracing up, no collector → export off → degraded flag true even though status is up
    const engines: readonly EngineHealth[] = [
      { engine: 'metrics', status: 'up', degraded: false },
      { engine: 'tracing', status: 'up', degraded: true, reason: 'no OTLP collector' },
    ];
    const h = observabilityHealth(engines);
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
    // an up-but-impaired engine flips the rollup but is not itself status-named;
    // the reason falls back to the generic impaired sentence (real behavior).
    expect(h.reason).toBe('one or more observability engines impaired');
  });

  it('an unknown engine (timed-out probe) → module degraded, never up', () => {
    const engines: readonly EngineHealth[] = [
      { engine: 'metrics', status: 'up', degraded: false },
      { engine: 'signals', status: 'unknown', degraded: false, reason: 'probe timeout' },
    ];
    const h = observabilityHealth(engines);
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
    expect(h.status).not.toBe('up');
    expect(h.reason).toContain('signals: unknown');
  });

  it('preserves the full per-engine breakdown with reasons (per-source truth intact)', () => {
    const engines: readonly EngineHealth[] = [
      { engine: 'logging', status: 'up', degraded: false },
      { engine: 'signals', status: 'down', degraded: false, reason: 'sidecar absent' },
    ];
    const h = observabilityHealth(engines);
    expect(h.engines).toEqual([
      { name: 'logging', status: 'up' },
      { name: 'signals', status: 'down', reason: 'sidecar absent' },
    ]);
  });

  it('the reason names every status-non-up engine (down/unknown), joined', () => {
    const engines: readonly EngineHealth[] = [
      { engine: 'metrics', status: 'up', degraded: false },
      { engine: 'signals', status: 'down', degraded: false, reason: 'sidecar absent' },
      { engine: 'audit', status: 'unknown', degraded: false, reason: 'verify unreachable' },
    ];
    const h = observabilityHealth(engines);
    expect(h.reason).toContain('signals: down (sidecar absent)');
    expect(h.reason).toContain('audit: unknown (verify unreachable)');
    expect(h.reason).toContain(';');
  });

  it('an empty engine set → up (nothing impaired)', () => {
    const h = observabilityHealth([]);
    expect(h.status).toBe('up');
    expect(h.degraded).toBe(false);
    expect(h.engines).toEqual([]);
  });
});
