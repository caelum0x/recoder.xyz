import { describe, it, expect } from 'vitest';
import {
  conversionRatePct,
  classifyLeadSource,
  summarizeLeadsBySource,
} from './lead-funnel';

describe('conversionRatePct', () => {
  it('returns null when there are no leads (undefined rate, not 0%)', () => {
    expect(conversionRatePct(0, 0)).toBeNull();
    expect(conversionRatePct(5, 0)).toBeNull();
  });

  it('computes a rounded whole-number percentage', () => {
    expect(conversionRatePct(1, 4)).toBe(25);
    expect(conversionRatePct(1, 3)).toBe(33); // 33.33 -> 33
    expect(conversionRatePct(2, 3)).toBe(67); // 66.66 -> 67
    expect(conversionRatePct(50, 200)).toBe(25);
  });

  it('returns 100 when every lead converted', () => {
    expect(conversionRatePct(10, 10)).toBe(100);
  });

  it('clamps converted above total to 100 instead of overflowing', () => {
    expect(conversionRatePct(12, 10)).toBe(100);
  });

  it('guards against non-finite input', () => {
    expect(conversionRatePct(NaN, 10)).toBeNull();
    expect(conversionRatePct(5, Infinity)).toBeNull();
  });
});

describe('classifyLeadSource', () => {
  it('routes signup-page sources to signupPage', () => {
    expect(classifyLeadSource('signup_page_lead_capture')).toBe('signupPage');
    expect(classifyLeadSource('SIGNUP')).toBe('signupPage');
  });

  it('routes homepage sources to homepage', () => {
    expect(classifyLeadSource('homepage_hero_lead_capture')).toBe('homepage');
  });

  it('routes unknown / null / legacy sources to other', () => {
    expect(classifyLeadSource('website')).toBe('other');
    expect(classifyLeadSource(null)).toBe('other');
    expect(classifyLeadSource(undefined)).toBe('other');
    expect(classifyLeadSource('')).toBe('other');
  });

  it('prefers signup over home when a source mentions both', () => {
    // "signup" check runs first by design.
    expect(classifyLeadSource('home_signup_combo')).toBe('signupPage');
  });
});

describe('summarizeLeadsBySource', () => {
  it('folds rows into the three canonical buckets', () => {
    const result = summarizeLeadsBySource([
      { source: 'homepage_hero_lead_capture', count: 10 },
      { source: 'signup_page_lead_capture', count: 4 },
      { source: 'website', count: 3 },
      { source: null, count: 2 },
    ]);
    expect(result).toEqual({ homepage: 10, signupPage: 4, other: 5 });
  });

  it('always returns all three keys, even with no rows', () => {
    expect(summarizeLeadsBySource([])).toEqual({
      homepage: 0,
      signupPage: 0,
      other: 0,
    });
  });

  it('accumulates duplicate sources and ignores negative/NaN counts', () => {
    const result = summarizeLeadsBySource([
      { source: 'homepage_a', count: 5 },
      { source: 'homepage_b', count: 7 },
      { source: 'homepage_c', count: -3 },
      { source: 'homepage_d', count: NaN },
    ]);
    expect(result.homepage).toBe(12);
  });
});
