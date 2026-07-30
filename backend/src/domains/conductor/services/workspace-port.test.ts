/**
 * Per-workspace RECODER_PORT allocator.
 *
 * Proves: the port is deterministic (same id → same port across calls), always
 * lands inside [base, base+span), differs across ids (spread), degrades an empty
 * id to base, and clamps a non-positive span/base rather than emitting NaN or an
 * out-of-range port.
 */
import { describe, it, expect } from 'vitest';
import { computeWorkspacePort, DEFAULT_PORT_BASE, DEFAULT_PORT_SPAN } from './workspace-port.js';

describe('computeWorkspacePort', () => {
  it('is deterministic for the same id', () => {
    expect(computeWorkspacePort('ws_abc')).toBe(computeWorkspacePort('ws_abc'));
  });

  it('always lands inside [base, base+span)', () => {
    for (const id of ['ws_1', 'ws_2', 'ws_zzz', 'feat/x', 'a', 'ws_' + 'x'.repeat(64)]) {
      const p = computeWorkspacePort(id);
      expect(p).toBeGreaterThanOrEqual(DEFAULT_PORT_BASE);
      expect(p).toBeLessThan(DEFAULT_PORT_BASE + DEFAULT_PORT_SPAN);
    }
  });

  it('honors a custom base and span', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = computeWorkspacePort(`ws_${i}`, 5000, 10);
      expect(p).toBeGreaterThanOrEqual(5000);
      expect(p).toBeLessThan(5010);
    }
  });

  it('spreads different ids across the range (not all the same port)', () => {
    const ports = new Set(Array.from({ length: 40 }, (_, i) => computeWorkspacePort(`ws_${i}`)));
    expect(ports.size).toBeGreaterThan(1);
  });

  it('degrades an empty id to base', () => {
    expect(computeWorkspacePort('')).toBe(DEFAULT_PORT_BASE);
    expect(computeWorkspacePort('   ')).toBe(DEFAULT_PORT_BASE);
    expect(computeWorkspacePort('', 6000)).toBe(6000);
  });

  it('clamps a non-positive span to a single deterministic port', () => {
    expect(computeWorkspacePort('ws_1', 7000, 0)).toBe(7000);
    expect(computeWorkspacePort('ws_1', 7000, -5)).toBe(7000);
  });

  it('falls back to the default base when given a bad base', () => {
    expect(computeWorkspacePort('', -1)).toBe(DEFAULT_PORT_BASE);
    expect(computeWorkspacePort('', 1.5)).toBe(DEFAULT_PORT_BASE);
  });
});
