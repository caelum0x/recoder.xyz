import { describe, expect, it } from 'vitest';
import {
  A2A_ENVELOPE_ERROR_SCHEMA_VERSION,
  INVALID_A2A_ENVELOPE_CODE,
  buildInvalidA2AEnvelopeErrorResponse,
  validateInvalidA2AEnvelopeErrorResponse,
  assertInvalidA2AEnvelopeErrorResponse,
} from './error-contract';
import { INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT } from './error-contract.snapshot';

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------
describe('A2A error contract constants', () => {
  it('schema version is a2a-envelope-error-v1', () => {
    expect(A2A_ENVELOPE_ERROR_SCHEMA_VERSION).toBe('a2a-envelope-error-v1');
  });

  it('error code is INVALID_A2A_ENVELOPE', () => {
    expect(INVALID_A2A_ENVELOPE_CODE).toBe('INVALID_A2A_ENVELOPE');
  });
});

// ---------------------------------------------------------------------------
// buildInvalidA2AEnvelopeErrorResponse
// ---------------------------------------------------------------------------
describe('buildInvalidA2AEnvelopeErrorResponse', () => {
  it('produces correct shape with issues', () => {
    const response = buildInvalidA2AEnvelopeErrorResponse({
      issues: [
        { path: 'threadId', message: 'must be a non-empty string' },
        { path: 'from', message: 'must be an object' },
      ],
    });

    expect(response).toEqual({
      ok: false,
      error: 'Invalid A2A envelope',
      code: 'INVALID_A2A_ENVELOPE',
      schemaVersion: 'a2a-envelope-error-v1',
      issues: [
        { path: 'threadId', message: 'must be a non-empty string' },
        { path: 'from', message: 'must be an object' },
      ],
    });
  });

  it('uses custom error message when provided', () => {
    const response = buildInvalidA2AEnvelopeErrorResponse({
      issues: [{ path: 'intent', message: 'required' }],
      error: 'Custom validation failure',
    });

    expect(response.error).toBe('Custom validation failure');
    expect(response.ok).toBe(false);
    expect(response.code).toBe(INVALID_A2A_ENVELOPE_CODE);
    expect(response.schemaVersion).toBe(A2A_ENVELOPE_ERROR_SCHEMA_VERSION);
  });

  it('produces empty issues array when no issues given', () => {
    const response = buildInvalidA2AEnvelopeErrorResponse({ issues: [] });
    expect(response.issues).toEqual([]);
    expect(response.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snapshot lock — all gateways must match this shape
// ---------------------------------------------------------------------------
describe('A2A error snapshot contract', () => {
  it('snapshot has correct structure', () => {
    expect(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.ok).toBe(false);
    expect(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.code).toBe('INVALID_A2A_ENVELOPE');
    expect(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.schemaVersion).toBe('a2a-envelope-error-v1');
    expect(typeof INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.error).toBe('string');
    expect(Array.isArray(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.issues)).toBe(true);
  });

  it('snapshot passes validation', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT);
    expect(result.valid).toBe(true);
  });

  it('snapshot passes assertion', () => {
    expect(() =>
      assertInvalidA2AEnvelopeErrorResponse(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT),
    ).not.toThrow();
  });

  it('snapshot issues all have path and message', () => {
    for (const issue of INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// validateInvalidA2AEnvelopeErrorResponse
// ---------------------------------------------------------------------------
describe('validateInvalidA2AEnvelopeErrorResponse', () => {
  const validPayload = buildInvalidA2AEnvelopeErrorResponse({
    issues: [{ path: 'from.id', message: 'must be a non-empty string' }],
  });

  it('accepts valid error response', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse(validPayload);
    expect(result.valid).toBe(true);
  });

  it('rejects null', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse(null);
    expect(result.valid).toBe(false);
  });

  it('rejects array', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse([]);
    expect(result.valid).toBe(false);
  });

  it('rejects ok=true', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({ ...validPayload, ok: true });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('ok must be false');
  });

  it('rejects wrong code', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({ ...validPayload, code: 'WRONG' });
    expect(result.valid).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({
      ...validPayload,
      schemaVersion: 'wrong-version',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects non-string error', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({ ...validPayload, error: 42 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-array issues', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({ ...validPayload, issues: 'bad' });
    expect(result.valid).toBe(false);
  });

  it('rejects issue missing path', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({
      ...validPayload,
      issues: [{ message: 'oops' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('issues[0].path');
  });

  it('rejects issue missing message', () => {
    const result = validateInvalidA2AEnvelopeErrorResponse({
      ...validPayload,
      issues: [{ path: 'from' }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain('issues[0].message');
  });
});

// ---------------------------------------------------------------------------
// assertInvalidA2AEnvelopeErrorResponse
// ---------------------------------------------------------------------------
describe('assertInvalidA2AEnvelopeErrorResponse', () => {
  it('does not throw for valid payload', () => {
    const payload = buildInvalidA2AEnvelopeErrorResponse({
      issues: [{ path: 'to', message: 'required' }],
    });
    expect(() => assertInvalidA2AEnvelopeErrorResponse(payload)).not.toThrow();
  });

  it('throws for invalid payload', () => {
    expect(() => assertInvalidA2AEnvelopeErrorResponse({ ok: true })).toThrow(
      'contract violation',
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-gateway contract lock: buildInvalidA2AEnvelopeErrorResponse output
// must be accepted by validateInvalidA2AEnvelopeErrorResponse
// ---------------------------------------------------------------------------
describe('builder-validator round-trip', () => {
  it('builder output always passes validator', () => {
    const testCases = [
      { issues: [] },
      { issues: [{ path: '$', message: 'root' }] },
      {
        issues: [
          { path: 'from.id', message: 'required' },
          { path: 'to.platform', message: 'invalid' },
          { path: 'payload[0].kind', message: 'unknown' },
        ],
      },
      { issues: [{ path: 'intent', message: 'invalid' }], error: 'Custom' },
    ];

    for (const tc of testCases) {
      const response = buildInvalidA2AEnvelopeErrorResponse(tc);
      const result = validateInvalidA2AEnvelopeErrorResponse(response);
      expect(result.valid).toBe(true);
    }
  });
});
