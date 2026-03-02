export function fieldArrayToObject(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 2) out[values[i]] = values[i + 1];
  return out;
}

export function normalizeMessages(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const bucket = data[0];
  if (!Array.isArray(bucket) || !Array.isArray(bucket[1])) return [];
  return bucket[1];
}

export async function readBatch(ctx) {
  try {
    const claimed = await ctx.redis.xautoclaim(
      ctx.streamKey,
      ctx.group,
      ctx.consumer,
      ctx.claimMinIdleMs,
      '0-0',
      'COUNT',
      10,
    );
    const entries = Array.isArray(claimed) && Array.isArray(claimed[1]) ? claimed[1] : [];
    if (entries.length > 0) return entries;
  } catch (error) {
    const message = String(error?.message || error || '');
    if (!message.includes('ERR') && !message.includes('unknown command')) {
      if (ctx.logError) {
        ctx.logError('[a2a-worker] xautoclaim failed', { message });
      }
    }
  }

  const data = await ctx.redis.xreadgroup(
    'GROUP',
    ctx.group,
    ctx.consumer,
    'COUNT',
    10,
    'BLOCK',
    5000,
    'STREAMS',
    ctx.streamKey,
    '>',
  );
  return normalizeMessages(data);
}

export async function processBatchOnce(ctx) {
  const messages = await readBatch(ctx);
  if (!messages.length) return { processed: 0 };

  let processed = 0;
  for (const [entryId, fields] of messages) {
    await processEntry({ entryId, fields }, ctx);
    processed++;
  }
  return { processed };
}

export async function processEntry(entry, ctx) {
  const { entryId, fields } = entry;
  const record = ctx.fieldArrayToObject(fields);
  const target = ctx.normalizeService(record.targetService);
  const self = ctx.normalizeService(ctx.serviceId);
  const messageId = String(record.messageId || entryId);

  if (!target && !ctx.consumeUntargeted) {
    await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
    return { status: 'skipped', reason: 'untargeted' };
  }
  if (target && target !== self) {
    await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
    return { status: 'skipped', reason: 'target_mismatch' };
  }

  let envelope = null;
  try {
    envelope = record.envelope ? JSON.parse(record.envelope) : null;
  } catch {
    envelope = null;
  }

  const intent = String(record.intent || envelope?.intent || '');
  const workflowId = ctx.workflowIdFromRecord(record, envelope, entryId);

  await ctx.emitAmbEvent(
    workflowId,
    intent,
    ctx.buildWorkflowStartedText(intent, messageId),
    ctx.serviceId,
  );
  await ctx.emitAmbEvent(
    workflowId,
    intent,
    ctx.buildTaskAssignedText(ctx.consumer),
    'a2a-worker',
  );

  try {
    const result = await ctx.executeIntent(record, envelope);
    const attempt = ctx.parseAttempt(record);

    if (result.status === 'error' && attempt < ctx.maxRetries) {
      const nextAttempt = attempt + 1;
      const delayMs = ctx.retryDelayForAttempt(attempt);
      if (delayMs > 0) await ctx.sleep(delayMs);

      const retryStreamId = await ctx.requeueForRetry(record, envelope, result, nextAttempt);
      await ctx.emitResult(
        record,
        envelope,
        { status: 'retry_scheduled', attempt, nextAttempt, retryStreamId, delayMs, error: result },
        entryId,
      );
      await ctx.emitAmbEvent(
        workflowId,
        intent,
        ctx.buildRetryScheduledText('task_error', attempt, nextAttempt, delayMs),
        'a2a-worker',
      );
      await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
      return { status: 'retry_scheduled', attempt, nextAttempt };
    }

    await ctx.emitResult(record, envelope, result, entryId);
    if (result.status === 'ok') {
      await ctx.emitAmbEvent(
        workflowId,
        intent,
        ctx.buildTaskCompletedText(result.httpStatus),
        'a2a-worker',
      );
      await ctx.emitAmbEvent(workflowId, intent, ctx.buildWorkflowCompletionText('ok'), ctx.serviceId);
    } else {
      await ctx.emitAmbEvent(
        workflowId,
        intent,
        ctx.buildTaskFinishedWithErrorText(result),
        'a2a-worker',
      );
      await ctx.emitAmbEvent(workflowId, intent, ctx.buildWorkflowCompletionText('error'), ctx.serviceId);
    }

    await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
    return { status: String(result.status || 'unknown') };
  } catch (error) {
    const result = {
      status: 'error',
      reason: 'worker_exception',
      error: error instanceof Error ? error.message : 'unknown_error',
    };
    const attempt = ctx.parseAttempt(record);

    if (attempt < ctx.maxRetries) {
      const nextAttempt = attempt + 1;
      const delayMs = ctx.retryDelayForAttempt(attempt);
      if (delayMs > 0) await ctx.sleep(delayMs);
      const retryStreamId = await ctx.requeueForRetry(record, envelope, result, nextAttempt);
      await ctx.emitResult(
        record,
        envelope,
        { status: 'retry_scheduled', attempt, nextAttempt, retryStreamId, delayMs, error: result },
        entryId,
      );
      await ctx.emitAmbEvent(
        workflowId,
        intent,
        ctx.buildRetryScheduledText('worker_exception', attempt, nextAttempt, delayMs),
        'a2a-worker',
      );
      await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
      return { status: 'retry_scheduled', attempt, nextAttempt };
    }

    await ctx.emitResult(record, envelope, result, entryId);
    await ctx.emitAmbEvent(
      workflowId,
      intent,
      ctx.buildWorkerExceptionTerminalText(result.error),
      'a2a-worker',
    );
    await ctx.emitAmbEvent(workflowId, intent, ctx.buildWorkflowCompletionText('worker_exception'), ctx.serviceId);
    await ctx.redis.xack(ctx.streamKey, ctx.group, entryId);
    return { status: 'error', reason: 'worker_exception' };
  }
}
