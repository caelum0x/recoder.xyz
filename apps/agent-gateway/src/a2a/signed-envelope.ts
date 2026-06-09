import {
  validateSignedEnvelopeIngress,
  type SignedEnvelope,
} from '@recoder/a2a-sdk';

export type SignedEnvelopeVerificationResult<TPayload = unknown> =
  | { ok: true; envelope: SignedEnvelope<TPayload>; payload: TPayload }
  | { ok: false; status: number; error: string };

export function verifyGatewaySignedEnvelope<TPayload = unknown>(
  value: unknown,
  options: {
    secret?: string;
    requireSignature?: boolean;
    now?: Date;
  } = {},
): SignedEnvelopeVerificationResult<TPayload> {
  const result = validateSignedEnvelopeIngress<TPayload>(value, options);
  return result.ok
    ? result
    : { ok: false, status: result.status, error: result.message };
}
