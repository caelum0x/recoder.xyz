import type { InvalidA2AEnvelopeErrorResponse } from './error-contract';
import invalidEnvelopeErrorSnapshot from './snapshots/invalid-envelope-error.snapshot.json';

export const INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT: InvalidA2AEnvelopeErrorResponse =
  invalidEnvelopeErrorSnapshot as InvalidA2AEnvelopeErrorResponse;
