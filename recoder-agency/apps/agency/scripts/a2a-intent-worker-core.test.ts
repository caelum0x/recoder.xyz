import { describe, expect, it, vi } from 'vitest';
import {
  fieldArrayToObject,
  normalizeMessages,
  processBatchOnce,
  processEntry,
  readBatch,
} from './a2a-intent-worker-core.mjs';
import {
  buildTaskAssignedText,
  buildRetryScheduledText,
  buildTaskCompletedText,
  buildTaskFinishedWithErrorText,
  buildWorkerExceptionTerminalText,
  buildWorkflowCompletionText,
  buildWorkflowStartedText,
} from './a2a-intent-worker-status.mjs';

function makeCtx(overrides: Record<string, unknown> = {}) {
  const redis = {
    xack: vi.fn().mockResolvedValue(1),
  };

  return {
    redis,
    streamKey: 'recoder:a2a:intents',
    group: 'group',
    consumer: 'consumer-1',
    serviceId: 'recoder_agency',
    consumeUntargeted: false,
    maxRetries: 2,
    fieldArrayToObject,
    normalizeService: (value: unknown) =>
      String(value || '').trim().toLowerCase().replace(/-/g, '_'),
    executeIntent: vi.fn().mockResolvedValue({ status: 'ok', httpStatus: 200 }),
    emitResult: vi.fn().mockResolvedValue(undefined),
    requeueForRetry: vi.fn().mockResolvedValue('retry-1'),
    emitAmbEvent: vi.fn().mockResolvedValue(undefined),
    workflowIdFromRecord: (record: Record<string, unknown>, envelope: Record<string, unknown> | null, entryId: string) =>
      `worker_${String(record.messageId || envelope?.messageId || entryId)}`,
    parseAttempt: (record: Record<string, unknown>) => {
      const raw = Number(record.attempt || '0');
      return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    },
    retryDelayForAttempt: () => 0,
    sleep: vi.fn().mockResolvedValue(undefined),
    buildWorkflowStartedText,
    buildTaskAssignedText,
    buildRetryScheduledText,
    buildTaskCompletedText,
    buildTaskFinishedWithErrorText,
    buildWorkerExceptionTerminalText,
    buildWorkflowCompletionText,
    ...overrides,
  } as any;
}

function entry(fields: string[], id = '1710000000000-0') {
  return { entryId: id, fields };
}

describe('processEntry', () => {
  it('success', async () => {
    const ctx = makeCtx({
      executeIntent: vi.fn().mockResolvedValue({ status: 'ok', httpStatus: 200 }),
    });

    await processEntry(
      entry(['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'msg_1']),
      ctx,
    );

    expect(ctx.executeIntent).toHaveBeenCalledTimes(1);
    expect(ctx.requeueForRetry).not.toHaveBeenCalled();
    expect(ctx.emitResult).toHaveBeenCalledTimes(1);
    expect(ctx.emitResult.mock.calls[0][2]).toMatchObject({ status: 'ok' });
    expect(ctx.emitAmbEvent).toHaveBeenCalledWith(
      expect.any(String),
      'execute',
      'Workflow completed',
      'recoder_agency',
    );
    expect(ctx.redis.xack).toHaveBeenCalledTimes(1);
  });

  it('retry then success', async () => {
    const ctx = makeCtx({
      executeIntent: vi.fn()
        .mockResolvedValueOnce({ status: 'error', reason: 'upstream_500' })
        .mockResolvedValueOnce({ status: 'ok', httpStatus: 200 }),
    });

    await processEntry(
      entry(['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'msg_retry', 'attempt', '0']),
      ctx,
    );
    await processEntry(
      entry(['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'msg_retry', 'attempt', '1']),
      ctx,
    );

    expect(ctx.requeueForRetry).toHaveBeenCalledTimes(1);
    expect(ctx.emitResult).toHaveBeenCalledTimes(2);
    expect(ctx.emitResult.mock.calls[0][2]).toMatchObject({ status: 'retry_scheduled', nextAttempt: 1 });
    expect(ctx.emitResult.mock.calls[1][2]).toMatchObject({ status: 'ok' });
    expect(ctx.redis.xack).toHaveBeenCalledTimes(2);
  });

  it('max-retries dead-letter path (terminal error result)', async () => {
    const ctx = makeCtx({
      maxRetries: 2,
      executeIntent: vi.fn().mockResolvedValue({ status: 'error', reason: 'still_failing' }),
    });

    await processEntry(
      entry(['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'msg_dead', 'attempt', '2']),
      ctx,
    );

    expect(ctx.requeueForRetry).not.toHaveBeenCalled();
    expect(ctx.emitResult).toHaveBeenCalledTimes(1);
    expect(ctx.emitResult.mock.calls[0][2]).toMatchObject({ status: 'error', reason: 'still_failing' });
    expect(ctx.redis.xack).toHaveBeenCalledTimes(1);
  });

  it('target mismatch skip/ack', async () => {
    const ctx = makeCtx();

    await processEntry(
      entry(['targetService', 'recoder_backend', 'intent', 'execute', 'messageId', 'msg_skip']),
      ctx,
    );

    expect(ctx.executeIntent).not.toHaveBeenCalled();
    expect(ctx.emitResult).not.toHaveBeenCalled();
    expect(ctx.emitAmbEvent).not.toHaveBeenCalled();
    expect(ctx.redis.xack).toHaveBeenCalledTimes(1);
  });

  it('worker exception path', async () => {
    const ctx = makeCtx({
      maxRetries: 0,
      executeIntent: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await processEntry(
      entry(['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'msg_exc', 'attempt', '0']),
      ctx,
    );

    expect(ctx.requeueForRetry).not.toHaveBeenCalled();
    expect(ctx.emitResult).toHaveBeenCalledTimes(1);
    expect(ctx.emitResult.mock.calls[0][2]).toMatchObject({
      status: 'error',
      reason: 'worker_exception',
      error: 'boom',
    });
    expect(ctx.emitAmbEvent).toHaveBeenCalledWith(
      expect.any(String),
      'execute',
      'Workflow completed with worker exception',
      'recoder_agency',
    );
    expect(ctx.redis.xack).toHaveBeenCalledTimes(1);
  });
});

describe('batch helpers', () => {
  it('normalizeMessages handles empty and valid shapes', () => {
    expect(normalizeMessages(null as any)).toEqual([]);
    expect(normalizeMessages([] as any)).toEqual([]);
    expect(normalizeMessages([['stream', [['1-0', ['k', 'v']]]]])).toEqual([['1-0', ['k', 'v']]]);
  });

  it('readBatch uses xautoclaim when entries exist', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', [['1-0', ['targetService', 'recoder_agency']]], []]),
      xreadgroup: vi.fn(),
    };
    const messages = await readBatch({
      redis,
      streamKey: 'recoder:a2a:intents',
      group: 'group',
      consumer: 'consumer',
      claimMinIdleMs: 30000,
    } as any);

    expect(messages).toHaveLength(1);
    expect(redis.xreadgroup).not.toHaveBeenCalled();
  });

  it('readBatch falls back to xreadgroup when xautoclaim unsupported', async () => {
    const redis = {
      xautoclaim: vi.fn().mockRejectedValue(new Error('ERR unknown command `XAUTOCLAIM`')),
      xreadgroup: vi
        .fn()
        .mockResolvedValue([['recoder:a2a:intents', [['2-0', ['targetService', 'recoder_agency']]]]]),
    };
    const messages = await readBatch({
      redis,
      streamKey: 'recoder:a2a:intents',
      group: 'group',
      consumer: 'consumer',
      claimMinIdleMs: 30000,
      logError: vi.fn(),
    } as any);

    expect(redis.xreadgroup).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(1);
  });

  it('processBatchOnce integrates readBatch + processEntry across entries', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue([
        '0-0',
        [
          ['1-0', ['targetService', 'recoder_agency', 'intent', 'execute', 'messageId', 'ok_1']],
          ['1-1', ['targetService', 'recoder_backend', 'intent', 'execute', 'messageId', 'skip_1']],
        ],
        [],
      ]),
      xreadgroup: vi.fn(),
      xack: vi.fn().mockResolvedValue(1),
    };
    const ctx = makeCtx({ redis });

    const result = await processBatchOnce({
      ...ctx,
      claimMinIdleMs: 30000,
      logError: vi.fn(),
    });

    expect(result).toEqual({ processed: 2 });
    expect(ctx.executeIntent).toHaveBeenCalledTimes(1);
    expect(redis.xack).toHaveBeenCalledTimes(2);
  });
});
