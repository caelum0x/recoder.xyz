import { beforeEach, describe, expect, it } from 'vitest';
import { INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT } from '@recoder/shared/a2a';
import {
  __createSignatureForTest,
  __resetA2ATestState,
  buildInvalidA2AEnvelopeError,
  checkAndStoreEnvelopeIdempotency,
  parseEnvelopeFromUnknown,
  verifyIncomingA2ARequest,
} from '~/lib/.server/a2a-gateway';

const SECRET = 'test-shared-secret';

describe('api.a2a.envelope gateway checks', () => {
  beforeEach(() => {
    process.env.RECODER_A2A_SHARED_SECRET = SECRET;
    process.env.RECODER_A2A_ALLOWED_AGENTS = 'sender';
    __resetA2ATestState();
  });

  it('rejects bad signature', async () => {
    const body = JSON.stringify({ messageId: 'msg-web-1' });
    const result = await verifyIncomingA2ARequest({
      headers: new Headers({
        'x-recoder-a2a-agent-id': 'sender',
        'x-recoder-a2a-timestamp': `${Math.floor(Date.now() / 1000)}`,
        'x-recoder-a2a-signature': 'v1=bad',
      }),
      rawBody: body,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('rejects stale timestamp', async () => {
    const body = JSON.stringify({ messageId: 'msg-web-2' });
    const stale = `${Math.floor((Date.now() - 10 * 60 * 1000) / 1000)}`;
    const signature = await __createSignatureForTest(stale, body, SECRET);

    const result = await verifyIncomingA2ARequest({
      headers: new Headers({
        'x-recoder-a2a-agent-id': 'sender',
        'x-recoder-a2a-timestamp': stale,
        'x-recoder-a2a-signature': `v1=${signature}`,
      }),
      rawBody: body,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('flags replayed message id as duplicate', async () => {
    const envelope: any = { messageId: 'msg-web-replay', intent: 'execute' };

    const first = await checkAndStoreEnvelopeIdempotency(envelope);
    const second = await checkAndStoreEnvelopeIdempotency(envelope);

    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(second).toEqual({ accepted: true, duplicate: true });
  });

  it('locks invalid-envelope error payload contract snapshot', () => {
    const parsed = parseEnvelopeFromUnknown({ messageId: 'm-1' }, 'envelope');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(buildInvalidA2AEnvelopeError({ issues: parsed.issues })).toEqual(
      INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT,
    );
  });
});
