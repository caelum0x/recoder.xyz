import Redis from 'ioredis';
import { createAmbEmitter } from './a2a-intent-worker-amb.mjs';
import { fieldArrayToObject, processBatchOnce } from './a2a-intent-worker-core.mjs';
import {
  buildTaskAssignedText,
  buildRetryScheduledText,
  buildTaskCompletedText,
  buildTaskFinishedWithErrorText,
  buildWorkerExceptionTerminalText,
  buildWorkflowCompletionText,
  buildWorkflowStartedText,
} from './a2a-intent-worker-status.mjs';

const serviceId = process.env.RECODER_A2A_CONSUMER_SERVICE || 'recoder_agency';
const streamKey = process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents';
const resultsKey = process.env.RECODER_A2A_RESULTS_STREAM_KEY || 'recoder:a2a:results';
const deadLetterKey = process.env.RECODER_A2A_DEADLETTER_STREAM_KEY || 'recoder:a2a:deadletter';
const group = process.env.RECODER_A2A_CONSUMER_GROUP || `recoder-a2a-workers-${serviceId}`;
const consumer = process.env.RECODER_A2A_CONSUMER_NAME || `recoder-agency-${process.pid}`;
const redisUrl = process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
const consumeUntargeted = process.env.RECODER_A2A_CONSUME_UNTARGETED === 'true';
const claimMinIdleMs = Number(process.env.RECODER_A2A_CLAIM_MIN_IDLE_MS || 30000);
const groupStartId = process.env.RECODER_A2A_GROUP_START_ID || '$';
const maxRetries = Math.max(0, Number(process.env.RECODER_A2A_MAX_RETRIES || 2));
const retryDelayMs = Math.max(0, Number(process.env.RECODER_A2A_RETRY_DELAY_MS || 500));
const retryBackoffMultiplier = Math.max(1, Number(process.env.RECODER_A2A_RETRY_BACKOFF_MULTIPLIER || 2));
const retryMaxDelayMs = Math.max(retryDelayMs, Number(process.env.RECODER_A2A_RETRY_MAX_DELAY_MS || 10000));
const ambDisabled = process.env.RECODER_A2A_AMB_DISABLED === '1';
const ambBaseUrl = (
  process.env.RECODER_A2A_AMB_BASE_URL ||
  process.env.DOCKER_BACKEND_URL ||
  'http://localhost:7777'
).replace(/\/$/, '');

if (!redisUrl) {
  console.error('[a2a-worker] Missing RECODER_A2A_REDIS_URL/REDIS_URL');
  process.exit(1);
}

const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
const ambEmitter = createAmbEmitter({
  baseUrl: ambBaseUrl,
  serviceId,
  disabled: ambDisabled,
});

function normalizeService(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
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

function workflowIdFromRecord(record, envelope, entryId) {
  const messageId = String(record.messageId || envelope?.messageId || entryId || '');
  return `worker_${messageId || Date.now().toString(36)}`;
}

async function emitAmbEvent(workflowId, intent, text, senderAgentId = 'a2a-worker') {
  if (ambDisabled) return;

  try {
    await ambEmitter.emit(workflowId, intent, text, senderAgentId);
  } catch (error) {
    console.warn('[a2a-worker] AMB emit failed', {
      workflowId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
  const outcome = await processBatchOnce({
    redis,
    streamKey,
    group,
    consumer,
    claimMinIdleMs,
    logError: (message, meta) => console.error(message, meta),
    serviceId,
    consumeUntargeted,
    maxRetries,
    fieldArrayToObject,
    normalizeService,
    executeIntent,
    emitResult,
    requeueForRetry,
    emitAmbEvent,
    workflowIdFromRecord,
    parseAttempt,
    retryDelayForAttempt,
    sleep,
    buildWorkflowStartedText,
    buildTaskAssignedText,
    buildRetryScheduledText,
    buildTaskCompletedText,
    buildTaskFinishedWithErrorText,
    buildWorkerExceptionTerminalText,
    buildWorkflowCompletionText,
  });
  if (!outcome.processed) continue;
}
