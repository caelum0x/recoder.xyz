import { createHmac, randomUUID } from 'node:crypto';

const secret = process.env.RECODER_A2A_SHARED_SECRET ?? 'local-dev-secret';
const timestamp = `${Math.floor(Date.now() / 1000)}`;
const envelope = {
  protocolVersion: '0.3.0',
  envelopeVersion: '2026-06-06',
  messageId: `a2a-smoke-${randomUUID()}`,
  threadId: `a2a-smoke-thread-${randomUUID()}`,
  traceId: `a2a-smoke-trace-${randomUUID()}`,
  createdAt: new Date().toISOString(),
  intent: 'execute',
  payload: [{ kind: 'text', text: 'Recoder Agent OS dry A2A smoke.' }],
};

const body = JSON.stringify(envelope);
const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

console.log(JSON.stringify({
  ok: true,
  mode: process.env.RECODER_A2A_GATEWAY_URL ? 'gateway-configured' : 'dry-contract',
  envelope,
  signedHeaders: {
    'x-recoder-a2a-timestamp': timestamp,
    'x-recoder-a2a-signature': signature,
  },
}, null, 2));
