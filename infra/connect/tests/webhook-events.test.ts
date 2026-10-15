import { describe, expect, it } from 'vitest';
import { markWebhookEventProcessed, recordWebhookEvent } from '../src/billing/webhook-events.js';
import { createFakeDb } from './fake-db.js';

describe('recordWebhookEvent', () => {
  it('records a new event id and reports it as not-yet-processed', async () => {
    const fake = createFakeDb([]);
    const result = await recordWebhookEvent(fake.db, 'msg_1', 'subscription.active', 'acct_1', '{"type":"subscription.active"}');
    expect(result.alreadyProcessed).toBe(false);
    expect(fake.inserted).toHaveLength(1);
    expect((fake.inserted[0] as { id: string }).id).toBe('msg_1');
  });

  it('reports an id already present in the inbox as already processed, without inserting again', async () => {
    const fake = createFakeDb([{ id: 'msg_1' }]);
    const result = await recordWebhookEvent(fake.db, 'msg_1', 'subscription.active', 'acct_1', '{}');
    expect(result.alreadyProcessed).toBe(true);
    expect(fake.inserted).toHaveLength(0);
  });

  it('treats a concurrent unique-violation on insert as already-processed, not a thrown error', async () => {
    const fake = createFakeDb([]);
    fake.forceUniqueViolationOnNextInsert = true;
    const result = await recordWebhookEvent(fake.db, 'msg_1', 'subscription.active', 'acct_1', '{}');
    expect(result.alreadyProcessed).toBe(true);
  });

  it('re-throws a non-unique-violation error from the insert', async () => {
    const fake = createFakeDb([]);
    const originalInsert = (fake.db as unknown as { insert: () => { values: () => Promise<void> } }).insert;
    (fake.db as unknown as { insert: () => { values: () => Promise<void> } }).insert = () => ({
      values: async () => {
        throw new Error('connection reset');
      },
    });
    await expect(recordWebhookEvent(fake.db, 'msg_1', 'subscription.active', undefined, '{}')).rejects.toThrow('connection reset');
    expect(originalInsert).toBeDefined();
  });

  it('accepts an undefined accountId (an event that cannot be attributed yet)', async () => {
    const fake = createFakeDb([]);
    const result = await recordWebhookEvent(fake.db, 'msg_2', 'unknown.type', undefined, '{}');
    expect(result.alreadyProcessed).toBe(false);
    expect((fake.inserted[0] as { accountId: string | null }).accountId).toBeNull();
  });
});

describe('markWebhookEventProcessed', () => {
  it('writes a processedAt update for the given event id', async () => {
    const fake = createFakeDb([{ id: 'msg_1' }]);
    await markWebhookEventProcessed(fake.db, 'msg_1');
    expect(fake.updated).toHaveLength(1);
    expect((fake.updated[0] as { processedAt: Date }).processedAt).toBeInstanceOf(Date);
  });
});
