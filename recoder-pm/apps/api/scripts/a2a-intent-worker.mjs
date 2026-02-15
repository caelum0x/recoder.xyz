import Redis from 'ioredis';

const serviceId = process.env.RECODER_A2A_CONSUMER_SERVICE || 'recoder_pm';
const streamKey = process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents';
const resultsKey = process.env.RECODER_A2A_RESULTS_STREAM_KEY || 'recoder:a2a:results';
const deadLetterKey = process.env.RECODER_A2A_DEADLETTER_STREAM_KEY || 'recoder:a2a:deadletter';
const group = process.env.RECODER_A2A_CONSUMER_GROUP || `recoder-a2a-workers-${serviceId}`;
const consumer = process.env.RECODER_A2A_CONSUMER_NAME || `recoder-pm-${process.pid}`;
const redisUrl = process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
const consumeUntargeted = process.env.RECODER_A2A_CONSUME_UNTARGETED === 'true';
const claimMinIdleMs = Number(process.env.RECODER_A2A_CLAIM_MIN_IDLE_MS || 30000);
const groupStartId = process.env.RECODER_A2A_GROUP_START_ID || '$';
const maxRetries = Math.max(0, Number(process.env.RECODER_A2A_MAX_RETRIES || 2));
const retryDelayMs = Math.max(0, Number(process.env.RECODER_A2A_RETRY_DELAY_MS || 500));
const retryBackoffMultiplier = Math.max(1, Number(process.env.RECODER_A2A_RETRY_BACKOFF_MULTIPLIER || 2));
const retryMaxDelayMs = Math.max(retryDelayMs, Number(process.env.RECODER_A2A_RETRY_MAX_DELAY_MS || 10000));

if (!redisUrl) {
  console.error('[a2a-worker] Missing RECODER_A2A_REDIS_URL/REDIS_URL');
  process.exit(1);
}

const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });

function normalizeService(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function fieldArrayToObject(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 2) out[values[i]] = values[i + 1];
  return out;
}

function handlerUrlForIntent(intent) {
  const map = {
    plan: process.env.RECODER_A2A_PLAN_HANDLER_URL,
    execute: process.env.RECODER_A2A_EXECUTE_HANDLER_URL,
    handoff: process.env.RECODER_A2A_HANDOFF_HANDLER_URL,
    tool_call: process.env.RECODER_A2A_TOOL_CALL_HANDLER_URL,
  };
  return map[intent] || process.env.RECODER_A2A_DEFAULT_HANDLER_URL || '';
}

function buildWorkerHeaders() {
  const headers = { 'content-type': 'application/json' };
  const token = process.env.RECODER_A2A_WORKER_TOKEN;
  if (token) headers['x-recoder-a2a-worker-token'] = token;
  return headers;
}

async function executeIntent(record, envelope) {
  const intent = String(record.intent || envelope?.intent || '');
  const handlerUrl = handlerUrlForIntent(intent);
  if (!handlerUrl) {
    return { status: 'ignored', reason: 'no_handler_url', intent };
  }

  try {
    const response = await fetch(handlerUrl, {
      method: 'POST',
      headers: buildWorkerHeaders(),
      body: JSON.stringify({ source: 'a2a-worker', serviceId, intent, envelope, record }),
    });
    return { status: response.ok ? 'ok' : 'error', intent, httpStatus: response.status };
  } catch (error) {
    return { status: 'error', intent, error: error instanceof Error ? error.message : 'handler_failed' };
  }
}

function normalizeMessages(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const bucket = data[0];
  if (!Array.isArray(bucket) || !Array.isArray(bucket[1])) return [];
  return bucket[1];
}

async function readBatch() {
  try {
    const claimed = await redis.xautoclaim(streamKey, group, consumer, claimMinIdleMs, '0-0', 'COUNT', 10);
    const entries = Array.isArray(claimed) && Array.isArray(claimed[1]) ? claimed[1] : [];
    if (entries.length > 0) return entries;
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('ERR') && !message.includes('unknown command')) {
      console.error('[a2a-worker] xautoclaim failed', { message });
    }
  }

  const data = await redis.xreadgroup('GROUP', group, consumer, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', streamKey, '>');
  return normalizeMessages(data);
}

async function emitResult(record, envelope, result, entryId) {
  await redis.xadd(
    resultsKey,
    '*',
    'service',
    serviceId,
    'messageId',
    String(record.messageId || envelope?.messageId || entryId),
    'intent',
    String(record.intent || envelope?.intent || ''),
    'status',
    String(result.status),
    'detail',
    JSON.stringify(result),
  );

  if (result.status === 'error') {
    await redis.xadd(
      deadLetterKey,
      '*',
      'service',
      serviceId,
      'messageId',
      String(record.messageId || envelope?.messageId || entryId),
      'intent',
      String(record.intent || envelope?.intent || ''),
      'entryId',
      String(entryId),
      'detail',
      JSON.stringify(result),
      'record',
      JSON.stringify(record),
    );
  }
}

function retryDelayForAttempt(attempt) {
  const multiplier = Math.pow(retryBackoffMultiplier, Math.max(0, attempt));
  return Math.min(retryMaxDelayMs, Math.floor(retryDelayMs * multiplier));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAttempt(record) {
  const raw = Number(record.attempt || '0');
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

async function requeueForRetry(record, envelope, result, nextAttempt) {
  return redis.xadd(
    streamKey,
    '*',
    'service',
    String(record.service || serviceId),
    'fromService',
    String(record.fromService || serviceId),
    'targetService',
    String(record.targetService || 'unknown'),
    'intent',
    String(record.intent || envelope?.intent || ''),
    'messageId',
    String(record.messageId || envelope?.messageId || ''),
    'threadId',
    String(record.threadId || envelope?.threadId || ''),
    'payload',
    String(record.payload || JSON.stringify(envelope?.payload ?? [])),
    'envelope',
    String(record.envelope || JSON.stringify(envelope ?? null)),
    'attempt',
    String(nextAttempt),
    'lastError',
    JSON.stringify(result),
  );
}

let running = true;
async function shutdown(signal) {
  running = false;
  console.log(`[a2a-worker] ${signal} received, shutting down`);
  try {
    await redis.quit();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await redis.xgroup('CREATE', streamKey, group, groupStartId, 'MKSTREAM').catch((error) => {
  if (!String(error?.message || '').includes('BUSYGROUP')) throw error;
});

console.log('[a2a-worker] started', { serviceId, streamKey, group, consumer, claimMinIdleMs });

while (running) {
  const messages = await readBatch();
  if (!messages.length) continue;

  for (const [entryId, fields] of messages) {
    const record = fieldArrayToObject(fields);
    const target = normalizeService(record.targetService);
    const self = normalizeService(serviceId);

    if (!target && !consumeUntargeted) {
      await redis.xack(streamKey, group, entryId);
      continue;
    }
    if (target && target !== self) {
      await redis.xack(streamKey, group, entryId);
      continue;
    }

    let envelope = null;
    try {
      envelope = record.envelope ? JSON.parse(record.envelope) : null;
    } catch {
      envelope = null;
    }

    try {
      const result = await executeIntent(record, envelope);
      const attempt = parseAttempt(record);
      if (result.status === 'error' && attempt < maxRetries) {
        const nextAttempt = attempt + 1;
        const delayMs = retryDelayForAttempt(attempt);
        if (delayMs > 0) await sleep(delayMs);
        const retryStreamId = await requeueForRetry(record, envelope, result, nextAttempt);
        await emitResult(
          record,
          envelope,
          { status: 'retry_scheduled', attempt, nextAttempt, retryStreamId, delayMs, error: result },
          entryId,
        );
      } else {
        await emitResult(record, envelope, result, entryId);
      }
    } catch (error) {
      const result = { status: 'error', reason: 'worker_exception', error: error instanceof Error ? error.message : 'unknown_error' };
      const attempt = parseAttempt(record);
      if (attempt < maxRetries) {
        const nextAttempt = attempt + 1;
        const delayMs = retryDelayForAttempt(attempt);
        if (delayMs > 0) await sleep(delayMs);
        const retryStreamId = await requeueForRetry(record, envelope, result, nextAttempt);
        await emitResult(
          record,
          envelope,
          { status: 'retry_scheduled', attempt, nextAttempt, retryStreamId, delayMs, error: result },
          entryId,
        );
      } else {
        await emitResult(record, envelope, result, entryId);
      }
    }

    await redis.xack(streamKey, group, entryId);
  }
}
