import { beforeEach, describe, expect, it } from 'vitest';
import { INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT } from '@recoder/shared/a2a';
import {
  __createSignatureForTest,
  __resetA2ATestState,
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  verifyIncomingRequest,
} from './a2a-gateway';

describe('a2a-gateway', () => {
  const secret = 'test-shared-secret';

  beforeEach(() => {
    process.env.RECODER_A2A_SHARED_SECRET = secret;
    process.env.RECODER_A2A_ALLOWED_AGENTS = 'sender';
    __resetA2ATestState();
  });

  it('rejects bad signature', async () => {
    const body = JSON.stringify({ messageId: 'msg-1' });
    const result = await verifyIncomingRequest({
      rawBody: body,
      headers: {
        'x-recoder-a2a-agent-id': 'sender',
        'x-recoder-a2a-timestamp': `${Math.floor(Date.now() / 1000)}`,
        'x-recoder-a2a-signature': 'v1=bad',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('rejects stale timestamp', async () => {
    const body = JSON.stringify({ messageId: 'msg-2' });
    const stale = `${Math.floor((Date.now() - 10 * 60 * 1000) / 1000)}`;
    const signature = await __createSignatureForTest(stale, body, secret);

    const result = await verifyIncomingRequest({
      rawBody: body,
      headers: {
        'x-recoder-a2a-agent-id': 'sender',
        'x-recoder-a2a-timestamp': stale,
        'x-recoder-a2a-signature': `v1=${signature}`,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('flags replayed message id as duplicate', async () => {
    const envelope: any = { messageId: 'msg-replay', intent: 'execute' };

    const first = await checkAndStoreEnvelopeIdempotency(envelope);
    const second = await checkAndStoreEnvelopeIdempotency(envelope);

    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(second).toEqual({ accepted: true, duplicate: true });
  });

  it('builds a stable invalid-envelope error payload contract', () => {
    expect(
      buildInvalidA2AEnvelopeError({
        issues: INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT.issues,
      }),
    ).toEqual(INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT);
  });
});
