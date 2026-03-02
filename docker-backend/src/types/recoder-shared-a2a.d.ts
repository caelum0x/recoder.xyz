declare module '@recoder/shared/a2a' {
  export interface A2AEnvelopeValidationIssue {
    path: string;
    message: string;
  }

  export interface RecoderA2AEnvelope {
    messageId: string;
    threadId: string;
    intent: string;
    payload?: unknown[];
  }

  export function buildInvalidA2AEnvelopeErrorResponse(input: {
    issues: A2AEnvelopeValidationIssue[];
    error?: string;
  }): {
    ok: false;
    error: string;
    code: 'INVALID_A2A_ENVELOPE';
    schemaVersion: 'a2a-envelope-error-v1';
    issues: A2AEnvelopeValidationIssue[];
  };
}
