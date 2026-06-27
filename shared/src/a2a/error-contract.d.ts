export declare const A2A_ENVELOPE_ERROR_SCHEMA_VERSION = "a2a-envelope-error-v1";
export declare const INVALID_A2A_ENVELOPE_CODE = "INVALID_A2A_ENVELOPE";
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
export declare function buildInvalidA2AEnvelopeErrorResponse(input: {
    issues: A2AEnvelopeValidationIssue[];
    error?: string;
}): InvalidA2AEnvelopeErrorResponse;
/**
 * Runtime validation for InvalidA2AEnvelopeErrorResponse shape.
 * Use at API boundaries to verify error payloads match the contract.
 */
export declare function validateInvalidA2AEnvelopeErrorResponse(value: unknown): {
    valid: true;
    data: InvalidA2AEnvelopeErrorResponse;
} | {
    valid: false;
    reason: string;
};
/**
 * Assertion wrapper — throws if the value doesn't match the contract.
 */
export declare function assertInvalidA2AEnvelopeErrorResponse(value: unknown): asserts value is InvalidA2AEnvelopeErrorResponse;
