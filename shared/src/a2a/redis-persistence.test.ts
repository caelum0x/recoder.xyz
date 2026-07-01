import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A2A_TASK_STORE_KEY,
  PersistentTaskStore,
} from './persistent-services';
import {
  RedisBackedPersistenceAdapter,
  createProductionA2AControlPlaneFromRedis,
  type RedisKvClient,
} from './redis-persistence';

class MockRedisClient implements RedisKvClient {
  readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async connect(): Promise<void> {}

  async quit(): Promise<void> {}
}

describe('RedisBackedPersistenceAdapter', () => {
  it('preloads keys and writes through to redis', async () => {
    const redis = new MockRedisClient();
    redis.store.set('a2a:persist:test-key', '{"hello":"world"}');

    const adapter = await RedisBackedPersistenceAdapter.fromClient({
      redis,
      preloadKeys: ['test-key'],
    });

    expect(adapter.read('test-key')).toBe('{"hello":"world"}');
    adapter.write('another-key', 'value-2');
    expect(redis.store.get('a2a:persist:another-key')).toBe('value-2');
  });

  it('degrades safely when write-through to redis rejects', async () => {
    const failingRedis: RedisKvClient = {
      async get() {
        return null;
      },
      async set() {
        throw new Error('redis unavailable');
      },
    };
    const errors: Array<{ key: string; error: unknown }> = [];
    const adapter = await RedisBackedPersistenceAdapter.fromClient({
      redis: failingRedis,
      onWriteThroughError: (input) => errors.push(input),
    });

    // Must not throw and must not produce an unhandled rejection.
    expect(() => adapter.write('k1', 'v1')).not.toThrow();
    // Local cache stays authoritative.
    expect(adapter.read('k1')).toBe('v1');

    // Allow the rejected write-through microtask to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe('k1');
    expect(errors[0].error).toBeInstanceOf(Error);
  });

  it('degrades safely when the client throws synchronously', async () => {
    const throwingRedis: RedisKvClient = {
      async get() {
        return null;
      },
      set() {
        throw new Error('sync boom');
      },
    };
    const errors: Array<{ key: string; error: unknown }> = [];
    const adapter = await RedisBackedPersistenceAdapter.fromClient({
      redis: throwingRedis,
      onWriteThroughError: (input) => errors.push(input),
    });

    expect(() => adapter.write('k2', 'v2')).not.toThrow();
    expect(adapter.read('k2')).toBe('v2');
    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe('k2');
  });

  it('flushes cached keys explicitly', async () => {
    const redis = new MockRedisClient();
    const adapter = await RedisBackedPersistenceAdapter.fromClient({ redis });

    adapter.write('k1', 'v1');
    await adapter.flush(['k1']);
    expect(redis.store.get('a2a:persist:k1')).toBe('v1');
  });
});

describe('createProductionA2AControlPlaneFromRedis', () => {
  it('builds control plane with persistent services via adapter', async () => {
    const redis = new MockRedisClient();
    const seeded = JSON.stringify({
      tasks: [],
      events: [],
    });
    redis.store.set(`a2a:persist:${DEFAULT_A2A_TASK_STORE_KEY}`, seeded);

    const adapter = await RedisBackedPersistenceAdapter.fromClient({ redis });
    const taskStore = new PersistentTaskStore(adapter);
    taskStore.create({
      id: 't1',
      threadId: 'th1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requester: { id: 'a1', name: 'A1', platform: 'codex' },
      assignee: { id: 'a2', name: 'A2', platform: 'claude_code' },
      state: 'submitted',
      prompt: 'hello',
    });

    expect(adapter.read(DEFAULT_A2A_TASK_STORE_KEY)).toContain('"id":"t1"');
  });

  it('exposes async factory symbol', async () => {
    // This asserts the factory is callable and typed; URL path is not executed in tests.
    expect(typeof createProductionA2AControlPlaneFromRedis).toBe('function');
  });
});
