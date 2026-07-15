import { describe, it, expect } from 'vitest';
import { buildInteropHealth } from '../health.js';
import { makeInteropConfig } from './_fakes.js';

describe('buildInteropHealth — truthful edge/A2A health', () => {
  it('is up when the gate + ingress verifier are wired and the internal key is present', () => {
    const h = buildInteropHealth({
      gateWired: true,
      ingressVerifierWired: true,
      config: makeInteropConfig({ internalServiceKeyPresent: true }),
    });
    expect(h.status).toBe('up');
    expect(h.degraded).toBe(false);
  });

  it('is DOWN when the governance gate is not wired (every edge fails closed)', () => {
    const h = buildInteropHealth({
      gateWired: false,
      ingressVerifierWired: true,
      config: makeInteropConfig({ internalServiceKeyPresent: true }),
    });
    expect(h.status).toBe('down');
    expect(h.reason).toMatch(/gate not wired/);
  });

  it('DEGRADES (never faked up) when no signed-ingress verifier is wired', () => {
    const h = buildInteropHealth({
      gateWired: true,
      ingressVerifierWired: false,
      config: makeInteropConfig({ internalServiceKeyPresent: true }),
    });
    expect(h.status).toBe('degraded');
    expect(h.reason).toMatch(/signed-ingress|ingress/);
  });

  it('DEGRADES (not down) when the internal service key is absent', () => {
    const h = buildInteropHealth({
      gateWired: true,
      ingressVerifierWired: true,
      config: makeInteropConfig({ internalServiceKeyPresent: false }),
    });
    expect(h.status).toBe('degraded');
    expect(h.reason).toMatch(/INTERNAL_SERVICE_KEY/);
  });
});
