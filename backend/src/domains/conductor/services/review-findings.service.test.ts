/**
 * Line-level review validator (recoder-7z42) — the false-positive gate: a finding is
 * surfaced ONLY when line-anchored + evidence-backed + confident enough; bare
 * assertions, low-confidence, malformed, and duplicate findings are dropped; survivors
 * are severity-ranked and capped. Never fabricates.
 */
import { describe, it, expect } from 'vitest';
import { validateFindings, type ReviewFinding } from './review-findings.service.js';

const f = (over: Partial<ReviewFinding>): ReviewFinding => ({
  file: 'src/a.ts',
  line: 12,
  severity: 'high',
  message: 'possible null deref',
  evidence: 'x.foo() where x can be null (line 12)',
  ...over,
});

describe('validateFindings', () => {
  it('keeps a line-anchored, evidence-backed finding', () => {
    const r = validateFindings([f({})]);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toBe(0);
    expect(r.summary).toMatch(/1 evidence-backed finding/i);
  });

  it('DROPS a finding with no evidence (bare assertion — the anti-hallucination gate)', () => {
    const r = validateFindings([f({ evidence: '' }), f({ evidence: '   ' })]);
    expect(r.kept).toEqual([]);
    expect(r.dropped).toBe(2);
  });

  it('DROPS a finding below the confidence floor but keeps one at/above it', () => {
    const r = validateFindings([f({ confidence: 0.2 }), f({ line: 20, confidence: 0.9 })], { minConfidence: 0.5 });
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].line).toBe(20);
  });

  it('DROPS malformed findings (no file, line < 1, empty message)', () => {
    const r = validateFindings([f({ file: '' }), f({ line: 0 }), f({ message: '' })]);
    expect(r.kept).toEqual([]);
  });

  it('dedupes by file:line:message and severity-ranks the survivors', () => {
    const r = validateFindings([
      f({ line: 5, severity: 'low', message: 'style' }),
      f({ line: 5, severity: 'low', message: 'style' }), // dup
      f({ line: 8, severity: 'critical', message: 'sql injection' }),
    ]);
    expect(r.kept.map((k) => k.severity)).toEqual(['critical', 'low']);
    expect(r.dropped).toBe(1);
  });

  it('caps the surfaced findings', () => {
    const many = Array.from({ length: 60 }, (_, i) => f({ line: i + 1, message: `m${i}` }));
    expect(validateFindings(many, { maxFindings: 10 }).kept).toHaveLength(10);
  });
});
