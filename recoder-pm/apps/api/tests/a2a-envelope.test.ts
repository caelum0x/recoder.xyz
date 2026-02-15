import assert from 'node:assert/strict';
import { INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT } from '@recoder/shared/a2a';
import test from 'node:test';
import { POST } from '../app/api/a2a/envelope/route';
import {
  __createSignatureForTest,
  __resetA2ATestState,
  buildInvalidA2AEnvelopeError,
  parseEnvelopeFromUnknown,
} from '../lib/a2a/gateway';

const SECRET = 'test-shared-secret';

function envelopeBody() {
  return {
    envelopeVersion: '2026-02-14',
    protocolVersion: '0.3.0',
    messageId: 'msg-pm-1',
    threadId: 'thread-pm-1',
    createdAt: new Date().toISOString(),
    from: { id: 'sender', name: 'Sender', platform: 'custom' },
    to: { id: 'pm', name: 'PM', platform: 'recoder_pm' },
    intent: 'execute',
    payload: [{ kind: 'text', text: 'hello' }],
  };
}

async function signedRequest(body: unknown, timestamp: string) {
  const raw = JSON.stringify(body);
  const signature = await __createSignatureForTest(timestamp, raw, SECRET);
  return new Request('http://localhost/api/a2a/envelope', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-recoder-a2a-agent-id': 'sender',
      'x-recoder-a2a-timestamp': timestamp,
      'x-recoder-a2a-signature': `v1=${signature}`,
    },
    body: raw,
  });
}

test.beforeEach(() => {
  process.env.RECODER_A2A_SHARED_SECRET = SECRET;
  process.env.RECODER_A2A_ALLOWED_AGENTS = 'sender';
  __resetA2ATestState();
});

test('rejects bad signature', async () => {
  const req = new Request('http://localhost/api/a2a/envelope', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-recoder-a2a-agent-id': 'sender',
      'x-recoder-a2a-timestamp': `${Math.floor(Date.now() / 1000)}`,
      'x-recoder-a2a-signature': 'v1=bad',
    },
    body: JSON.stringify(envelopeBody()),
  });

  const response = await POST(req);
  assert.equal(response.status, 401);
});

test('rejects stale timestamp', async () => {
  const stale = `${Math.floor((Date.now() - 10 * 60 * 1000) / 1000)}`;
  const response = await POST(await signedRequest(envelopeBody(), stale));
  assert.equal(response.status, 401);
});

test('returns duplicate on replay', async () => {
  const ts = `${Math.floor(Date.now() / 1000)}`;
  const body = envelopeBody();

  const first = await POST(await signedRequest(body, ts));
  const second = await POST(await signedRequest(body, ts));

  assert.equal(first.status, 200);
  assert.equal(second.status, 202);
});

test('locks invalid-envelope error payload contract', () => {
  const parsed = parseEnvelopeFromUnknown({ messageId: 'm-1' }, 'envelope');
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(buildInvalidA2AEnvelopeError({ issues: parsed.issues }), INVALID_A2A_ENVELOPE_ERROR_SNAPSHOT);
});
