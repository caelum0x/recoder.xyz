/**
 * Merge trust gate — proves the enforceable posture: `off` never interferes,
 * `warn` advises on any non-high merge, `block` REFUSES a low-trust merge and
 * advises a medium one. Every block carries the trust's own truthful reasons.
 */
import { describe, it, expect } from 'vitest';
import { evaluateMergeTrustGate, parseMergeTrustGateMode } from './merge-trust-gate.js';
import type { ConvergenceTrust } from './convergence-trust.js';

function trust(
  tier: ConvergenceTrust['tier'],
  score: number,
  reviewFlags: string[] = [],
  unjudgeable = false,
): ConvergenceTrust {
  return { score, tier, unjudgeable, factors: [], reviewFlags, summary: `${tier} trust (${score}/100)` };
}

describe('parseMergeTrustGateMode', () => {
  it('parses off/warn/block and defaults everything else to advisory warn', () => {
    expect(parseMergeTrustGateMode('off')).toBe('off');
    expect(parseMergeTrustGateMode('block')).toBe('block');
    expect(parseMergeTrustGateMode('WARN')).toBe('warn');
    // Unset/blank/unrecognized ⇒ advisory warn (compute trust, never block).
    expect(parseMergeTrustGateMode(undefined)).toBe('warn');
    expect(parseMergeTrustGateMode('')).toBe('warn');
    expect(parseMergeTrustGateMode('nonsense')).toBe('warn');
  });
});

describe('evaluateMergeTrustGate', () => {
  it('off: always allows, no warning, even for low trust', () => {
    const d = evaluateMergeTrustGate(trust('low', 20, ['fix blockers']), 'off');
    expect(d.allow).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.warning).toBeUndefined();
  });

  it('warn: allows but advises on a non-high merge (with review flags)', () => {
    const d = evaluateMergeTrustGate(trust('medium', 60, ['review LLM merge']), 'warn');
    expect(d.allow).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.warning).toMatch(/review LLM merge/i);
  });

  it('warn: high trust gets no advisory', () => {
    expect(evaluateMergeTrustGate(trust('high', 90), 'warn').warning).toBeUndefined();
  });

  it('block: REFUSES a low-trust merge with the truthful reason', () => {
    const d = evaluateMergeTrustGate(trust('low', 25, ['2 checks failing']), 'block');
    expect(d.allow).toBe(false);
    expect(d.blocked).toBe(true);
    expect(d.reason).toMatch(/blocked by trust gate/i);
    expect(d.reason).toMatch(/2 checks failing/);
  });

  it('block: allows a MEDIUM merge but attaches a warning', () => {
    const d = evaluateMergeTrustGate(trust('medium', 55, ['contested picks']), 'block');
    expect(d.allow).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.warning).toMatch(/contested picks/);
  });

  it('block: allows a HIGH merge cleanly', () => {
    const d = evaluateMergeTrustGate(trust('high', 88), 'block');
    expect(d.allow).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.escalated).toBe(false);
    expect(d.warning).toBeUndefined();
  });

  it('block: ESCALATES an unjudgeable merge to a human (refused but NOT blocked)', () => {
    const d = evaluateMergeTrustGate(trust('low', 40, ['verification unavailable'], true), 'block');
    expect(d.allow).toBe(false);
    expect(d.escalated).toBe(true);
    expect(d.blocked).toBe(false); // escalate is a human-routing, not a "bad merge" block
    expect(d.reason).toMatch(/escalated to human review/i);
    expect(d.reason).toMatch(/could not be judged/i);
  });

  it('warn: an unjudgeable merge is allowed but flagged for human escalation', () => {
    const d = evaluateMergeTrustGate(trust('medium', 55, [], true), 'warn');
    expect(d.allow).toBe(true);
    expect(d.escalated).toBe(true);
    expect(d.warning).toMatch(/escalate to a human/i);
  });

  it('off: an unjudgeable merge still passes untouched (no escalation)', () => {
    const d = evaluateMergeTrustGate(trust('low', 30, [], true), 'off');
    expect(d.allow).toBe(true);
    expect(d.escalated).toBe(false);
  });
});
