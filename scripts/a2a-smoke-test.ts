/**
 * A2A End-to-End Smoke Test
 *
 * Constructs a valid A2A envelope, signs it with HMAC-SHA256,
 * POSTs to the recoder-web gateway, and verifies the full pipeline
 * including Redis stream queueing.
 *
 * Usage:
 *   RECODER_A2A_SHARED_SECRET=<secret> npx tsx scripts/a2a-smoke-test.ts
 *
 * Environment:
 *   RECODER_A2A_SHARED_SECRET  - required, shared HMAC secret
 *   RECODER_A2A_GATEWAY_URL    - default: http://localhost:5173
 *   REDIS_URL                  - default: redis://localhost:6379
 */

import { createHmac, randomUUID } from 'node:crypto';

const GATEWAY_URL = process.env.RECODER_A2A_GATEWAY_URL || 'http://localhost:5173';
const SECRET = process.env.RECODER_A2A_SHARED_SECRET || '';
const REDIS_URL = process.env.REDIS_URL || process.env.RECODER_A2A_REDIS_URL || '';
const AGENT_ID = process.env.RECODER_A2A_AGENT_ID || 'smoke-test-agent';

if (!SECRET) {
  console.error('ERROR: RECODER_A2A_SHARED_SECRET is required');
  process.exit(1);
}

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

interface SmokeResult {
  step: string;
  ok: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

const results: SmokeResult[] = [];

function report(result: SmokeResult) {
  results.push(result);
  const icon = result.ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${result.step}`);
  if (result.error) console.log(`       ${result.error}`);
  if (result.details) console.log(`       ${JSON.stringify(result.details)}`);
}

async function main() {
  console.log('');
  console.log('=== A2A End-to-End Smoke Test ===');
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log(`Agent:   ${AGENT_ID}`);
  console.log('');

  // Step 1: Check A2A runtime diagnostics
  try {
    const runtimeRes = await fetch(`${GATEWAY_URL}/api/a2a/runtime`);
    const runtime = await runtimeRes.json() as Record<string, unknown>;
    report({
      step: 'A2A runtime diagnostics',
      ok: runtimeRes.ok && runtime.ok === true,
      details: { status: runtimeRes.status, persistence: runtime.persistence, redisConfigured: runtime.redisConfigured },
    });
  } catch (error) {
    report({
      step: 'A2A runtime diagnostics',
      ok: false,
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
  }

  // Step 2: Construct and send a valid A2A envelope
  const messageId = `smoke-${randomUUID()}`;
  const threadId = `smoke-thread-${randomUUID()}`;
  const envelope = {
    protocolVersion: '0.3.0',
    envelopeVersion: '2026-02-14',
    messageId,
    threadId,
    createdAt: new Date().toISOString(),
    intent: 'execute',
    from: {
      id: AGENT_ID,
      name: 'Smoke Test Agent',
      platform: 'custom',
    },
    to: {
      id: 'recoder-web',
      name: 'Recoder Web',
      platform: 'recoder_web',
    },
    payload: [
      {
        kind: 'text',
        text: 'A2A smoke test - verify end-to-end pipeline',
      },
    ],
    metadata: {
      test: true,
      smokeTestRun: new Date().toISOString(),
    },
  };

  const body = JSON.stringify(envelope);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = sign(timestamp, body, SECRET);

  try {
    const envelopeRes = await fetch(`${GATEWAY_URL}/api/a2a/envelope`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-recoder-a2a-agent-id': AGENT_ID,
        'x-recoder-a2a-timestamp': timestamp,
        'x-recoder-a2a-signature': signature,
      },
      body,
    });
    const envelopeData = await envelopeRes.json() as Record<string, unknown>;
    const intentResult = envelopeData.intentResult as Record<string, unknown> | undefined;
    const accepted = intentResult?.status === 'accepted';

    report({
      step: 'POST /api/a2a/envelope',
      ok: envelopeRes.ok && accepted,
      details: {
        httpStatus: envelopeRes.status,
        intentStatus: intentResult?.status,
        action: intentResult?.action,
        messageId,
      },
    });

    // Check if Redis queueing was reported
    const intentDetails = intentResult?.details as Record<string, unknown> | undefined;
    const redisDetails = intentDetails?.redis as Record<string, unknown> | undefined;
    if (redisDetails) {
      report({
        step: 'Redis stream queueing',
        ok: redisDetails.queued === true,
        details: {
          streamKey: redisDetails.streamKey,
          streamId: redisDetails.streamId,
          queued: redisDetails.queued,
        },
      });
    } else {
      report({
        step: 'Redis stream queueing',
        ok: false,
        error: 'No Redis details in response - Redis may not be configured',
      });
    }
  } catch (error) {
    report({
      step: 'POST /api/a2a/envelope',
      ok: false,
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
  }

  // Step 3: Check Redis streams directly (if Redis is accessible)
  if (REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
      await redis.connect();

      const intentLen = await redis.xlen('recoder:a2a:intents');
      const resultsLen = await redis.xlen('recoder:a2a:results');

      report({
        step: 'Redis stream lengths',
        ok: intentLen >= 1,
        details: {
          'recoder:a2a:intents': intentLen,
          'recoder:a2a:results': resultsLen,
        },
      });

      await redis.quit();
    } catch (error) {
      report({
        step: 'Redis stream lengths',
        ok: false,
        error: error instanceof Error ? error.message : 'redis_connect_failed',
      });
    }
  } else {
    report({
      step: 'Redis stream lengths',
      ok: false,
      error: 'REDIS_URL not set - skipping direct Redis verification',
    });
  }

  // Step 4: Verify idempotency (resend same envelope)
  try {
    const ts2 = `${Math.floor(Date.now() / 1000)}`;
    const sig2 = sign(ts2, body, SECRET);
    const idempotencyRes = await fetch(`${GATEWAY_URL}/api/a2a/envelope`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-recoder-a2a-agent-id': AGENT_ID,
        'x-recoder-a2a-timestamp': ts2,
        'x-recoder-a2a-signature': sig2,
      },
      body,
    });
    const idempotencyData = await idempotencyRes.json() as Record<string, unknown>;
    const isDuplicate = idempotencyData.duplicate === true;

    report({
      step: 'Idempotency check (duplicate envelope)',
      ok: isDuplicate,
      details: { duplicate: idempotencyData.duplicate, status: idempotencyRes.status },
    });
  } catch (error) {
    report({
      step: 'Idempotency check (duplicate envelope)',
      ok: false,
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`${passed}/${total} checks passed`);

  const allPassed = passed === total;
  if (!allPassed) {
    console.log('');
    console.log('Failed checks:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.step}: ${r.error || 'unknown'}`);
    }
  }

  console.log('');
  return allPassed;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error('Smoke test crashed:', error);
    process.exit(1);
  });
