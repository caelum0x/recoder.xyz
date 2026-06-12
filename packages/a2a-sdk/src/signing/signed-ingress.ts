import {
  isSignedEnvelope,
  type SignedEnvelope,
} from '../schemas/signed-envelope';
import { verifyHmacSha256Signature } from './hmac';

export type SignedEnvelopeIngressErrorCode =
  | 'signed_envelope_required'
  | 'signed_envelope_expired'
  | 'signed_envelope_not_yet_valid'
  | 'signed_envelope_bad_timestamp'
  | 'signed_envelope_unsupported_algorithm'
  | 'signed_envelope_secret_missing'
  | 'signed_envelope_bad_signature';

export type SignedEnvelopeIngressResult<TPayload = unknown> =
  | { ok: true; envelope: SignedEnvelope<TPayload>; payload: TPayload }
  | { ok: false; status: number; code: SignedEnvelopeIngressErrorCode; message: string };

export type ValidateSignedEnvelopeIngressOptions = {
  secret?: string;
  requireSignature?: boolean;
  now?: Date;
  maxFutureSkewMs?: number;
};

export function validateSignedEnvelopeIngress<TPayload = unknown>(
  value: unknown,
  options: ValidateSignedEnvelopeIngressOptions = {},
): SignedEnvelopeIngressResult<TPayload> {
  const requireSignature = options.requireSignature ?? Boolean(options.secret);

  if (!isSignedEnvelope(value)) {
    if (requireSignature) {
      return failure<TPayload>(400, 'signed_envelope_required', 'Expected a signed A2A envelope.');
    }
    return {
      ok: true,
      envelope: {
        envelope_version: '1.0.0',
        id: 'unsigned-local-envelope',
        payload_type: 'unsigned',
        payload: value as TPayload,
        signature: {
          algorithm: 'hmac-sha256',
          key_id: 'unsigned-local',
          signature: '',
          signed_at: new Date().toISOString(),
        },
      },
      payload: value as TPayload,
    };
  }

  const nowMs = options.now?.getTime() ?? Date.now();
  const signedAtMs = Date.parse(value.signature.signed_at);
  if (!Number.isFinite(signedAtMs)) {
    return failure<TPayload>(400, 'signed_envelope_bad_timestamp', 'Signed A2A envelope has an invalid signed_at timestamp.');
  }
  const maxFutureSkewMs = options.maxFutureSkewMs ?? 5 * 60 * 1000;
  if (signedAtMs - nowMs > maxFutureSkewMs) {
    return failure<TPayload>(401, 'signed_envelope_not_yet_valid', 'Signed A2A envelope timestamp is too far in the future.');
  }

  if (value.signature.expires_at) {
    const expiresAtMs = Date.parse(value.signature.expires_at);
    if (!Number.isFinite(expiresAtMs)) {
      return failure<TPayload>(400, 'signed_envelope_bad_timestamp', 'Signed A2A envelope has an invalid expires_at timestamp.');
    }
    if (expiresAtMs < nowMs) {
      return failure<TPayload>(401, 'signed_envelope_expired', 'Signed A2A envelope expired.');
    }
  }

  if (value.signature.algorithm !== 'hmac-sha256') {
    return failure<TPayload>(400, 'signed_envelope_unsupported_algorithm', `Unsupported signature algorithm: ${value.signature.algorithm}`);
  }

  if (!options.secret) {
    return requireSignature
      ? failure<TPayload>(500, 'signed_envelope_secret_missing', 'Signed envelope secret is not configured.')
      : { ok: true, envelope: value as SignedEnvelope<TPayload>, payload: value.payload as TPayload };
  }

  if (!verifyHmacSha256Signature(value.payload, value.signature.signature, options.secret)) {
    return failure<TPayload>(401, 'signed_envelope_bad_signature', 'Invalid signed A2A envelope signature.');
  }

  return { ok: true, envelope: value as SignedEnvelope<TPayload>, payload: value.payload as TPayload };
}

function failure<TPayload = unknown>(
  status: number,
  code: SignedEnvelopeIngressErrorCode,
  message: string,
): SignedEnvelopeIngressResult<TPayload> {
  return { ok: false, status, code, message };
}
