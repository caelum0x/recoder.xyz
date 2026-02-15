export const A2A_ENVELOPE_ERROR_SCHEMA_VERSION = 'a2a-envelope-error-v1';
export const INVALID_A2A_ENVELOPE_CODE = 'INVALID_A2A_ENVELOPE';

export interface A2AEnvelopeValidationIssue {
  path: string;
  message: string;
}

export interface InvalidA2AEnvelopeErrorResponse {
  ok: false;
  error: string;
  code: typeof INVALID_A2A_ENVELOPE_CODE;
  schemaVersion: typeof A2A_ENVELOPE_ERROR_SCHEMA_VERSION;
  issues: A2AEnvelopeValidationIssue[];
}

export function buildInvalidA2AEnvelopeErrorResponse(input: {
  issues: A2AEnvelopeValidationIssue[];
  error?: string;
}): InvalidA2AEnvelopeErrorResponse {
  return {
    ok: false,
    error: input.error || 'Invalid A2A envelope',
    code: INVALID_A2A_ENVELOPE_CODE,
    schemaVersion: A2A_ENVELOPE_ERROR_SCHEMA_VERSION,
    issues: input.issues,
  };
}

/**
 * Runtime validation for InvalidA2AEnvelopeErrorResponse shape.
 * Use at API boundaries to verify error payloads match the contract.
 */
export function validateInvalidA2AEnvelopeErrorResponse(
  value: unknown
): { valid: true; data: InvalidA2AEnvelopeErrorResponse } | { valid: false; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'must be an object' };
  }
  const obj = value as Record<string, unknown>;

  if (obj.ok !== false) {
    return { valid: false, reason: 'ok must be false' };
  }
  if (typeof obj.error !== 'string') {
    return { valid: false, reason: 'error must be a string' };
  }
  if (obj.code !== INVALID_A2A_ENVELOPE_CODE) {
    return { valid: false, reason: `code must be '${INVALID_A2A_ENVELOPE_CODE}'` };
  }
  if (obj.schemaVersion !== A2A_ENVELOPE_ERROR_SCHEMA_VERSION) {
    return { valid: false, reason: `schemaVersion must be '${A2A_ENVELOPE_ERROR_SCHEMA_VERSION}'` };
  }
  if (!Array.isArray(obj.issues)) {
    return { valid: false, reason: 'issues must be an array' };
  }

  for (let i = 0; i < obj.issues.length; i++) {
    const issue = obj.issues[i];
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
      return { valid: false, reason: `issues[${i}] must be an object` };
    }
    if (typeof (issue as Record<string, unknown>).path !== 'string') {
      return { valid: false, reason: `issues[${i}].path must be a string` };
    }
    if (typeof (issue as Record<string, unknown>).message !== 'string') {
      return { valid: false, reason: `issues[${i}].message must be a string` };
    }
  }

  return { valid: true, data: value as InvalidA2AEnvelopeErrorResponse };
}

/**
 * Assertion wrapper — throws if the value doesn't match the contract.
 */
export function assertInvalidA2AEnvelopeErrorResponse(
  value: unknown
): asserts value is InvalidA2AEnvelopeErrorResponse {
  const result = validateInvalidA2AEnvelopeErrorResponse(value);
  if (result.valid) return;
  const reason = "reason" in result ? result.reason : "unknown contract violation";
  throw new Error(`InvalidA2AEnvelopeErrorResponse contract violation: ${reason}`);
}
