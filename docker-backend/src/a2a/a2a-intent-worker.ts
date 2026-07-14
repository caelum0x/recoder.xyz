import Redis from 'ioredis';

type WorkerHandle = {
  stop: () => Promise<void>;
};

function normalizeService(value: string | undefined): string {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function fieldArrayToObject(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < values.length; i += 2) out[values[i]] = values[i + 1];
  return out;
}

function handlerUrlForIntent(intent: string): string {
  const map: Record<string, string | undefined> = {
    plan: process.env.RECODER_A2A_PLAN_HANDLER_URL,
    execute: process.env.RECODER_A2A_EXECUTE_HANDLER_URL,
    handoff: process.env.RECODER_A2A_HANDOFF_HANDLER_URL,
    tool_call: process.env.RECODER_A2A_TOOL_CALL_HANDLER_URL,
  };
  return map[intent] || process.env.RECODER_A2A_DEFAULT_HANDLER_URL || '';
}

function buildWorkerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = process.env.RECODER_A2A_WORKER_TOKEN;
  if (token) headers['x-recoder-a2a-worker-token'] = token;
  return headers;
}

async function executeIntent(serviceId: string, record: Record<string, string>, envelope: unknown) {
  const intent = String(record.intent || (envelope as any)?.intent || '');
  const handlerUrl = handlerUrlForIntent(intent);
  if (!handlerUrl) return { status: 'ignored', reason: 'no_handler_url', intent };

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

function normalizeMessages(data: unknown): [string, string[]][] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const bucket = data[0];
  if (!Array.isArray(bucket) || !Array.isArray(bucket[1])) return [];
  return bucket[1] as [string, string[]][];
}

export async function startA2AIntentWorker(input?: { serviceId?: string }): Promise<WorkerHandle | null> {
  const redisUrl = process.env.RECODER_A2A_REDIS_URL || process.env.REDIS_URL || '';
  if (!redisUrl) return null;

  const serviceId = input?.serviceId || process.env.RECODER_A2A_CONSUMER_SERVICE || 'recoder_backend';
  const streamKey = process.env.RECODER_A2A_INTENT_STREAM_KEY || 'recoder:a2a:intents';
  const resultsKey = process.env.RECODER_A2A_RESULTS_STREAM_KEY || 'recoder:a2a:results';
  const deadLetterKey = process.env.RECODER_A2A_DEADLETTER_STREAM_KEY || 'recoder:a2a:deadletter';
  const group = process.env.RECODER_A2A_CONSUMER_GROUP || `recoder-a2a-workers-${serviceId}`;
  const consumer = process.env.RECODER_A2A_CONSUMER_NAME || `docker-backend-${process.pid}`;
  const consumeUntargeted = process.env.RECODER_A2A_CONSUME_UNTARGETED === 'true';
  const claimMinIdleMs = Number(process.env.RECODER_A2A_CLAIM_MIN_IDLE_MS || 30000);
  const groupStartId = process.env.RECODER_A2A_GROUP_START_ID || '$';
  const maxRetries = Math.max(0, Number(process.env.RECODER_A2A_MAX_RETRIES || 2));
  const retryDelayMs = Math.max(0, Number(process.env.RECODER_A2A_RETRY_DELAY_MS || 500));
  const retryBackoffMultiplier = Math.max(1, Number(process.env.RECODER_A2A_RETRY_BACKOFF_MULTIPLIER || 2));
  const retryMaxDelayMs = Math.max(retryDelayMs, Number(process.env.RECODER_A2A_RETRY_MAX_DELAY_MS || 10000));

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
  await redis.xgroup('CREATE', streamKey, group, groupStartId, 'MKSTREAM').catch((error) => {
    if (!String((error as any)?.message || '').includes('BUSYGROUP')) throw error;
  });

  async function readBatch(): Promise<[string, string[]][]> {
    try {
      const claimed = (await redis.xautoclaim(streamKey, group, consumer, claimMinIdleMs, '0-0', 'COUNT', 10)) as unknown[];
      const entries = Array.isArray(claimed) && Array.isArray(claimed[1]) ? (claimed[1] as [string, string[]][]) : [];
      if (entries.length > 0) return entries;
    } catch (error) {
      const message = String((error as Error)?.message || '');
      if (!message.includes('ERR') && !message.includes('unknown command')) {
        console.error('[a2a-worker] xautoclaim failed', { message });
      }
    }

    const data = await redis.xreadgroup('GROUP', group, consumer, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', streamKey, '>');
    return normalizeMessages(data);
  }

  async function emitResult(
    record: Record<string, string>,
    envelope: unknown,
    result: Record<string, unknown>,
    entryId: string,
  ): Promise<void> {
    await redis.xadd(
      resultsKey,
      '*',
      'service',
      serviceId,
      'messageId',
      String(record.messageId || (envelope as any)?.messageId || entryId),
      'intent',
      String(record.intent || (envelope as any)?.intent || ''),
      'status',
      String((result as any).status),
      'detail',
      JSON.stringify(result),
    );

    if ((result as any).status === 'error') {
      await redis.xadd(
        deadLetterKey,
        '*',
        'service',
        serviceId,
        'messageId',
        String(record.messageId || (envelope as any)?.messageId || entryId),
        'intent',
        String(record.intent || (envelope as any)?.intent || ''),
        'entryId',
        String(entryId),
        'detail',
        JSON.stringify(result),
        'record',
        JSON.stringify(record),
      );
    }
  }

  function parseAttempt(record: Record<string, string>): number {
    const raw = Number(record.attempt || '0');
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  }

  async function requeueForRetry(
    record: Record<string, string>,
    envelope: unknown,
    result: Record<string, unknown>,
    nextAttempt: number,
  ): Promise<string | null> {
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
      String(record.intent || (envelope as any)?.intent || ''),
      'messageId',
      String(record.messageId || (envelope as any)?.messageId || ''),
      'threadId',
      String(record.threadId || (envelope as any)?.threadId || ''),
      'payload',
      String(record.payload || JSON.stringify((envelope as any)?.payload ?? [])),
      'envelope',
      String(record.envelope || JSON.stringify(envelope ?? null)),
      'attempt',
      String(nextAttempt),
      'lastError',
      JSON.stringify(result),
    );
  }

  function retryDelayForAttempt(attempt: number): number {
    const multiplier = Math.pow(retryBackoffMultiplier, Math.max(0, attempt));
    return Math.min(retryMaxDelayMs, Math.floor(retryDelayMs * multiplier));
  }

  async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  let running = true;
  const loop = async () => {
    while (running) {
      const messages = await readBatch();
      if (!messages.length) continue;

      for (const [entryId, fields] of messages) {
        const record = fieldArrayToObject(fields);
        const target = normalizeService(record.targetService);
        const self = normalizeService(serviceId);

        if ((!target && !consumeUntargeted) || (target && target !== self)) {
          await redis.xack(streamKey, group, entryId);
          continue;
        }

        let envelope: unknown = null;
        try {
          envelope = record.envelope ? JSON.parse(record.envelope) : null;
        } catch {
          envelope = null;
        }

        try {
          const result = await executeIntent(serviceId, record, envelope);
          const attempt = parseAttempt(record);
          if ((result as any).status === 'error' && attempt < maxRetries) {
            const nextAttempt = attempt + 1;
            const delayMs = retryDelayForAttempt(attempt);
            if (delayMs > 0) await sleep(delayMs);
            const retryStreamId = await requeueForRetry(record, envelope, result as Record<string, unknown>, nextAttempt);
            await emitResult(
              record,
              envelope,
              {
                status: 'retry_scheduled',
                attempt,
                nextAttempt,
                retryStreamId,
                delayMs,
                error: result as Record<string, unknown>,
              },
              entryId,
            );
          } else {
            await emitResult(record, envelope, result as Record<string, unknown>, entryId);
          }
        } catch (error) {
          const result = {
            status: 'error',
            reason: 'worker_exception',
            error: error instanceof Error ? error.message : 'unknown_error',
          };
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
  };

  void loop();

  return {
    stop: async () => {
      running = false;
      await redis.quit();
    },
  };
}

const _isMain = typeof require !== 'undefined' && require.main === module;
if (_isMain) {
  startA2AIntentWorker().then((handle) => {
    if (!handle) {
      console.error('[a2a-worker] Missing RECODER_A2A_REDIS_URL/REDIS_URL');
      process.exit(1);
    }

    process.on('SIGTERM', () => void handle.stop().then(() => process.exit(0)));
    process.on('SIGINT', () => void handle.stop().then(() => process.exit(0)));
  });
}
