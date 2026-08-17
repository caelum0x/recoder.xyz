/**
 * ComplianceRating tests — proves the keyword-overlap HINT rates truthfully:
 * `full` when every criterion's keywords surface in the evidence, `partial` when
 * some do, `none` when zero do, and `unknown` when there is nothing to judge (no
 * criteria) or nothing to judge against (no changed evidence). Also proves keyword
 * extraction drops the checkbox marker and stopwords.
 */
import { describe, it, expect } from 'vitest';
import { rateCompliance, extractKeywords } from './compliance-rating.js';

describe('extractKeywords', () => {
  it('drops the `[ ]` checkbox marker and leading bullet', () => {
    expect(extractKeywords('[ ] handles null token')).toEqual(['handles', 'null', 'token']);
    expect(extractKeywords('- [x] parse the config')).toEqual(['parse', 'config']);
    expect(extractKeywords('* [ ] refresh cache')).toEqual(['refresh', 'cache']);
  });

  it('drops stopwords and words shorter than 3 chars, lowercases, de-dups', () => {
    const kws = extractKeywords('[ ] The token MUST be a token for the user');
    // "the", "must", "for" (stopwords) and "be", "a" (<3) dropped; "token" de-duped.
    expect(kws).toEqual(['token', 'user']);
  });

  it('returns empty for a criterion with no salient words', () => {
    expect(extractKeywords('[ ] the and for')).toEqual([]);
  });
});

describe('rateCompliance', () => {
  it("rates 'full' when every criterion's keywords appear in the evidence", () => {
    const result = rateCompliance({
      criteria: ['[ ] handles null token', '[ ] validates email input'],
      changedPaths: ['src/auth/token.ts'],
      diffText: '+ if (token == null) return; // validates email input properly',
    });
    expect(result.rating).toBe('full');
    expect(result.metCount).toBe(2);
    expect(result.total).toBe(2);
    expect(result.unmet).toEqual([]);
  });

  it("rates 'partial' when only some criteria are addressed", () => {
    const result = rateCompliance({
      criteria: ['[ ] handles null token', '[ ] sends confirmation webhook'],
      changedPaths: ['src/auth/token.ts'],
      diffText: '+ if (token == null) throw new Error("null token");',
    });
    expect(result.rating).toBe('partial');
    expect(result.metCount).toBe(1);
    expect(result.total).toBe(2);
    expect(result.unmet).toEqual(['[ ] sends confirmation webhook']);
  });

  it("rates 'none' when no criterion keywords appear in the evidence", () => {
    const result = rateCompliance({
      criteria: ['[ ] handles null token', '[ ] validates email input'],
      changedPaths: ['docs/README.md'],
      diffText: '+ Updated the project description and license badge.',
    });
    expect(result.rating).toBe('none');
    expect(result.metCount).toBe(0);
    expect(result.total).toBe(2);
    expect(result.unmet).toHaveLength(2);
  });

  it("rates 'unknown' when there are no criteria (nothing was asked)", () => {
    const result = rateCompliance({
      criteria: [],
      changedPaths: ['src/auth/token.ts'],
      diffText: '+ some change',
    });
    expect(result.rating).toBe('unknown');
    expect(result.total).toBe(0);
    expect(result.metCount).toBe(0);
  });

  it("rates 'unknown' when there is no changed evidence to judge against", () => {
    const result = rateCompliance({
      criteria: ['[ ] handles null token'],
      changedPaths: [],
      diffText: null,
    });
    expect(result.rating).toBe('unknown');
    expect(result.total).toBe(1);
    expect(result.unmet).toEqual(['[ ] handles null token']);
  });

  it('matches keywords against changed paths alone (no diff text)', () => {
    const result = rateCompliance({
      criteria: ['[ ] update the token refresh handler'],
      changedPaths: ['src/auth/token-refresh-handler.ts'],
    });
    expect(result.rating).toBe('full');
    expect(result.metCount).toBe(1);
  });

  it('never throws and stays degrade-truthful on blank criteria', () => {
    const result = rateCompliance({
      criteria: ['   ', ''],
      changedPaths: ['src/x.ts'],
      diffText: '+ x',
    });
    expect(result.rating).toBe('unknown');
    expect(result.total).toBe(0);
  });
});
