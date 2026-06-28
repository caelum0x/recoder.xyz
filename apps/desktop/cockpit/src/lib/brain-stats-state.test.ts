/**
 * Unit tests for the brain-stats presentation helpers (brain-stats-state.ts).
 *
 * These exercise the pure display-state + formatting derivation over the REAL
 * GET /api/agent-os/brain/stats shape. No mocks: each case asserts the honest
 * headline / chip for a concrete BrainStats value, including the disabled and
 * "nothing reported yet" truthful states.
 */
import { describe, expect, it } from 'vitest';
import {
  brainDisplayState,
  brainHeadline,
  formatHitRate,
  formatTokens,
  governanceLabel,
  governanceTone,
} from './brain-stats-state';
import type { BrainCacheReport, BrainStats, GovernanceAudit } from '../types';

function report(partial: Partial<BrainCacheReport> = {}): BrainCacheReport {
  return {
    available: true,
    hits: 3,
    misses: 1,
    hitRate: 0.75,
    tokensSaved: 12345,
    detail: 'shared brain saved ~12345 tokens',
    ...partial,
  };
}

function stats(partial: Partial<BrainStats['brain']>): Pick<BrainStats, 'brain'> {
  return { brain: { enabled: true, report: report(), ...partial } };
}

describe('brainDisplayState', () => {
  it("is 'disabled' when the brain flag is off (no brain constructed)", () => {
    expect(brainDisplayState({ brain: { enabled: false, report: null } })).toBe('disabled');
  });

  it("is 'idle' when enabled but report is null", () => {
    expect(brainDisplayState({ brain: { enabled: true, report: null } })).toBe('idle');
  });

  it("is 'idle' when enabled but the report has not been read yet (available: false)", () => {
    expect(brainDisplayState(stats({ report: report({ available: false }) }))).toBe('idle');
  });

  it("is 'reporting' only when enabled AND the report is available", () => {
    expect(brainDisplayState(stats({}))).toBe('reporting');
  });
});

describe('formatTokens', () => {
  it('adds thousands separators', () => {
    expect(formatTokens(12345)).toBe('12,345');
    expect(formatTokens(1000000)).toBe('1,000,000');
  });

  it('rounds fractional token estimates', () => {
    expect(formatTokens(999.6)).toBe('1,000');
  });

  it('collapses zero / negative / non-finite to "0" (never a misleading NaN)', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(-5)).toBe('0');
    expect(formatTokens(Number.NaN)).toBe('0');
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('formatHitRate', () => {
  it('renders a 0..1 rate as a whole-number percent', () => {
    expect(formatHitRate(0.5)).toBe('50%');
    expect(formatHitRate(0.75)).toBe('75%');
    expect(formatHitRate(1)).toBe('100%');
  });

  it('clamps out-of-range and non-finite inputs to a truthful bound', () => {
    expect(formatHitRate(0)).toBe('0%');
    expect(formatHitRate(-1)).toBe('0%');
    expect(formatHitRate(2)).toBe('100%');
    expect(formatHitRate(Number.NaN)).toBe('0%');
  });
});

describe('brainHeadline', () => {
  it('says disabled when the flag is off', () => {
    expect(brainHeadline({ brain: { enabled: false, report: null } })).toBe(
      'Shared brain disabled (RECODER_BRAIN_ENABLED off).',
    );
  });

  it('says nothing-reported-yet when enabled but not read', () => {
    expect(brainHeadline({ brain: { enabled: true, report: null } })).toBe(
      'Shared brain enabled — nothing reported yet (not read since boot).',
    );
  });

  it('shows the real saved-tokens + reuse sentence when reporting', () => {
    expect(brainHeadline(stats({ report: report({ tokensSaved: 12345, hitRate: 0.75 }) }))).toBe(
      'Shared brain saved ~12,345 tokens, 75% reuse.',
    );
  });
});

describe('governanceLabel / governanceTone', () => {
  it('verified -> good, unverified -> bad', () => {
    const ok: GovernanceAudit = { ok: true, entries: 9, tipHash: 'abc' };
    const bad: GovernanceAudit = { ok: false, entries: 0 };
    expect(governanceLabel(ok)).toBe('audit verified');
    expect(governanceTone(ok)).toBe('good');
    expect(governanceLabel(bad)).toBe('audit unverified');
    expect(governanceTone(bad)).toBe('bad');
  });
});
