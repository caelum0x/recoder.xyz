import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSignedEnvelope,
  isSignedEnvelope,
  SIGNED_ENVELOPE_VERSION,
} from '../../../packages/a2a-sdk/src/schemas/signed-envelope';

test('signed envelopes wrap A2A payloads with auditable signature metadata', () => {
  const envelope = createSignedEnvelope({
    id: 'signed_1',
    payload_type: 'recoder.a2a.task-envelope',
    payload: { taskId: 'task_1' },
    signature: {
      algorithm: 'hmac-sha256',
      key_id: 'local-dev',
      signature: 'abc123',
      signed_at: '2026-06-06T00:00:00.000Z',
    },
  });

  assert.equal(envelope.envelope_version, SIGNED_ENVELOPE_VERSION);
  assert.equal(envelope.signature.algorithm, 'hmac-sha256');
  assert.equal(isSignedEnvelope(envelope), true);
  assert.equal(isSignedEnvelope({ ...envelope, signature: undefined }), false);
});
