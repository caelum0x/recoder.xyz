import type { RuntimePolicy } from '@recoder/agent-runtimes';
import { runtimeError } from '../errors/runtime-error';

/**
 * A signed envelope proving the task was authorized by the control plane. The runtime
 * VERIFIES presence/shape when `policy.requireSignedEnvelope` is set; it does not mint
 * or sign envelopes. Cryptographic verification is delegated to an injected verifier.
 */
export type SignedEnvelope = {
  signature: string;
  signedBy: string;
  signedAt: string;
  payloadHash: string;
};

export type EnvelopeVerifierFn = (envelope: SignedEnvelope) => boolean | Promise<boolean>;

export type EnvelopeCheckInput = {
  policy: Pick<RuntimePolicy, 'requireSignedEnvelope'>;
  envelope?: SignedEnvelope;
  verify?: EnvelopeVerifierFn;
};

/**
 * Returns `void` when the envelope requirement is satisfied (or not required).
 * Throws `policy_denied` when an envelope is required but missing or invalid.
 */
export async function assertSignedEnvelope(input: EnvelopeCheckInput): Promise<void> {
  if (!input.policy.requireSignedEnvelope) return;

  if (!input.envelope) {
    throw runtimeError('policy_denied', 'Signed envelope required by policy but none was provided.');
  }

  const verify = input.verify;
  if (!verify) {
    throw runtimeError(
      'policy_denied',
      'Signed envelope required but no envelope verifier is configured.',
    );
  }

  const ok = await verify(input.envelope);
  if (!ok) {
    throw runtimeError('policy_denied', 'Signed envelope failed verification.', {
      details: { signedBy: input.envelope.signedBy },
    });
  }
}
