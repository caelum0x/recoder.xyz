/**
 * @module context-bridge.test
 *
 * Comprehensive test suite for the ContextBridgeService.
 *
 * Covers:
 * - createContext: all valid types, size computation, size-limit enforcement, invalid types
 * - getContext: snapshot assembly, ordering, empty/missing tasks
 * - getContextByType: filtering, invalid type, no match
 * - appendContext: additive behaviour (does not overwrite)
 * - transferContext: full copy, fresh IDs, source-intact check, same-id guard,
 *   empty source, destination size-limit enforcement
 * - deleteContext: successful deletion, idempotent / missing task
 * - Singleton: getContextBridgeService / resetContextBridgeService
 * - InMemoryContextStore: TTL expiry, sweep, clear, taskCount
 * - generateContextId: uniqueness & prefix
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ContextBridgeService,
  InMemoryContextStore,
  getContextBridgeService,
  resetContextBridgeService,
  generateContextId,
  CONTEXT_TYPES,
  type ContextType,
  type ContextEntry,
} from '../context-bridge.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh service with in-memory store and generous defaults. */
function createService(overrides?: {
  ttl_ms?: number;
  max_size_bytes?: number;
  sweep_interval_ms?: number;
}): ContextBridgeService {
  const store = new InMemoryContextStore(
    overrides?.ttl_ms ?? 60_000,
    overrides?.sweep_interval_ms ?? 0, // disable sweep timer in tests
  );
  return new ContextBridgeService(
    {
      ttl_ms: overrides?.ttl_ms ?? 60_000,
      max_size_bytes: overrides?.max_size_bytes ?? 10 * 1024 * 1024,
      sweep_interval_ms: overrides?.sweep_interval_ms ?? 0,
    },
    store,
  );
}

// ===========================================================================
// generateContextId
// ===========================================================================

describe('generateContextId', () => {
  it('should include the given prefix', () => {
    const id = generateContextId('ctx');
    expect(id.startsWith('ctx_')).toBe(true);
  });

  it('should return unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateContextId('ctx')));
    expect(ids.size).toBe(100);
  });

  it('should work with different prefixes', () => {
    const a = generateContextId('alpha');
    const b = generateContextId('beta');
    expect(a.startsWith('alpha_')).toBe(true);
    expect(b.startsWith('beta_')).toBe(true);
  });
});

// ===========================================================================
// ContextBridgeService
// ===========================================================================

describe('ContextBridgeService', () => {
  let svc: ContextBridgeService;

  beforeEach(() => {
    svc = createService();
  });

  afterEach(() => {
    svc.dispose();
  });

  // -----------------------------------------------------------------------
  // createContext
  // -----------------------------------------------------------------------

  describe('createContext', () => {
    it('should create a workspace_files context entry', async () => {
      const result = await svc.createContext('task-1', 'workspace_files', {
        files: ['index.ts'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.task_id).toBe('task-1');
      expect(result.data.type).toBe('workspace_files');
      expect(result.data.data).toEqual({ files: ['index.ts'] });
      expect(result.data.id).toBeTruthy();
      expect(result.data.size_bytes).toBeGreaterThan(0);
      expect(result.data.created_at).toBeTruthy();
      expect(result.data.updated_at).toBeTruthy();
    });

    it('should create a conversation_history context entry', async () => {
      const result = await svc.createContext('task-1', 'conversation_history', [
        { role: 'user', content: 'hello' },
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.type).toBe('conversation_history');
    });

    it('should create a metadata context entry', async () => {
      const result = await svc.createContext('task-1', 'metadata', { version: '1.0' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.type).toBe('metadata');
    });

    it('should create an intermediate_results context entry', async () => {
      const result = await svc.createContext('task-1', 'intermediate_results', {
        step: 1,
        output: 'partial',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.type).toBe('intermediate_results');
    });

    it('should create an environment context entry', async () => {
      const result = await svc.createContext('task-1', 'environment', {
        NODE_ENV: 'test',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.type).toBe('environment');
    });

    it('should reject an invalid context type', async () => {
      const result = await svc.createContext('task-1', 'invalid_type' as ContextType, {});
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
      expect(result.error).toContain('Invalid context type');
    });

    it('should compute size_bytes correctly', async () => {
      const data = { key: 'value' };
      const expectedSize = Buffer.byteLength(JSON.stringify(data), 'utf-8');
      const result = await svc.createContext('task-1', 'metadata', data);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.size_bytes).toBe(expectedSize);
    });

    it('should enforce max size limit', async () => {
      const smallSvc = createService({ max_size_bytes: 100 });
      const bigData = { payload: 'x'.repeat(200) };
      const result = await smallSvc.createContext('task-1', 'metadata', bigData);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(413);
      expect(result.error).toContain('size limit exceeded');
      smallSvc.dispose();
    });

    it('should enforce cumulative size limit across entries', async () => {
      const smallSvc = createService({ max_size_bytes: 150 });
      // First entry fits
      const r1 = await smallSvc.createContext('task-1', 'metadata', { a: 'x'.repeat(50) });
      expect(r1.ok).toBe(true);
      // Second entry exceeds cumulative limit
      const r2 = await smallSvc.createContext('task-1', 'metadata', { b: 'x'.repeat(100) });
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.httpStatus).toBe(413);
      }
      smallSvc.dispose();
    });

    it('should allow null data', async () => {
      const result = await svc.createContext('task-1', 'metadata', null);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.data).toBeNull();
    });

    it('should handle string data', async () => {
      const result = await svc.createContext('task-1', 'metadata', 'just a string');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.data).toBe('just a string');
    });

    it('should handle numeric data', async () => {
      const result = await svc.createContext('task-1', 'metadata', 42);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.data).toBe(42);
    });

    it('should redact sensitive keys in stored context payloads', async () => {
      const result = await svc.createContext('task-1', 'metadata', {
        token: 'abc123',
        nested: {
          apiKey: 'secret-key',
          keep: 'visible',
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.data).toEqual({
        token: '[REDACTED]',
        nested: {
          apiKey: '[REDACTED]',
          keep: 'visible',
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // getContext
  // -----------------------------------------------------------------------

  describe('getContext', () => {
    it('should return a snapshot with all entries for a task', async () => {
      await svc.createContext('task-1', 'metadata', { a: 1 });
      await svc.createContext('task-1', 'environment', { b: 2 });

      const result = await svc.getContext('task-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.task_id).toBe('task-1');
      expect(result.data.entries).toHaveLength(2);
      expect(result.data.total_size_bytes).toBeGreaterThan(0);
      expect(result.data.created_at).toBeTruthy();
      expect(result.data.updated_at).toBeTruthy();
    });

    it('should return 404 for a task with no context', async () => {
      const result = await svc.getContext('nonexistent-task');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error).toContain('No context found');
    });

    it('should compute total_size_bytes as sum of all entries', async () => {
      const data1 = { x: 'hello' };
      const data2 = { y: 'world' };
      await svc.createContext('task-1', 'metadata', data1);
      await svc.createContext('task-1', 'environment', data2);

      const result = await svc.getContext('task-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedSize =
        Buffer.byteLength(JSON.stringify(data1), 'utf-8') +
        Buffer.byteLength(JSON.stringify(data2), 'utf-8');
      expect(result.data.total_size_bytes).toBe(expectedSize);
    });

    it('should set created_at to earliest and updated_at to latest', async () => {
      // We create two entries -- timestamps are set at creation time so
      // created_at <= updated_at on the snapshot.
      await svc.createContext('task-1', 'metadata', { first: true });
      await svc.createContext('task-1', 'environment', { second: true });

      const result = await svc.getContext('task-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(new Date(result.data.created_at).getTime()).toBeLessThanOrEqual(
        new Date(result.data.updated_at).getTime(),
      );
    });

    it('should not mix entries from different tasks', async () => {
      await svc.createContext('task-a', 'metadata', { from: 'a' });
      await svc.createContext('task-b', 'metadata', { from: 'b' });

      const result = await svc.getContext('task-a');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.entries).toHaveLength(1);
      expect(result.data.entries[0].data).toEqual({ from: 'a' });
    });
  });

  // -----------------------------------------------------------------------
  // getContextByType
  // -----------------------------------------------------------------------

  describe('getContextByType', () => {
    it('should return only entries of the requested type', async () => {
      await svc.createContext('task-1', 'metadata', { m: 1 });
      await svc.createContext('task-1', 'environment', { e: 1 });
      await svc.createContext('task-1', 'metadata', { m: 2 });

      const result = await svc.getContextByType('task-1', 'metadata');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
      result.data.forEach((entry) => expect(entry.type).toBe('metadata'));
    });

    it('should return 400 for an invalid type', async () => {
      const result = await svc.getContextByType('task-1', 'bogus' as ContextType);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
      expect(result.error).toContain('Invalid context type');
    });

    it('should return 404 when no entries of the type exist', async () => {
      await svc.createContext('task-1', 'metadata', { m: 1 });

      const result = await svc.getContextByType('task-1', 'environment');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error).toContain("No context of type 'environment'");
    });

    it('should return 404 for a task that has no context at all', async () => {
      const result = await svc.getContextByType('ghost-task', 'metadata');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // appendContext
  // -----------------------------------------------------------------------

  describe('appendContext', () => {
    it('should create a new entry without overwriting existing ones', async () => {
      await svc.createContext('task-1', 'conversation_history', [{ role: 'user', content: 'hi' }]);
      await svc.appendContext('task-1', 'conversation_history', [
        { role: 'assistant', content: 'hello' },
      ]);

      const result = await svc.getContextByType('task-1', 'conversation_history');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(2);
    });

    it('should return a valid ContextEntry', async () => {
      const result = await svc.appendContext('task-1', 'metadata', { appended: true });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBeTruthy();
      expect(result.data.type).toBe('metadata');
    });
  });

  // -----------------------------------------------------------------------
  // transferContext
  // -----------------------------------------------------------------------

  describe('transferContext', () => {
    it('should copy all entries from source to destination', async () => {
      await svc.createContext('task-src', 'metadata', { key: 'val' });
      await svc.createContext('task-src', 'environment', { env: 'prod' });

      const result = await svc.transferContext('task-src', 'task-dst');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.from_task_id).toBe('task-src');
      expect(result.data.to_task_id).toBe('task-dst');
      expect(result.data.entries_transferred).toBe(2);
      expect(result.data.total_size_bytes).toBeGreaterThan(0);
      expect(result.data.transferred_at).toBeTruthy();

      // Destination should now have entries
      const dstResult = await svc.getContext('task-dst');
      expect(dstResult.ok).toBe(true);
      if (!dstResult.ok) return;
      expect(dstResult.data.entries).toHaveLength(2);
    });

    it('should assign new IDs to transferred entries', async () => {
      await svc.createContext('task-src', 'metadata', { k: 1 });

      const srcResult = await svc.getContext('task-src');
      expect(srcResult.ok).toBe(true);
      if (!srcResult.ok) return;
      const srcEntryId = srcResult.data.entries[0].id;

      await svc.transferContext('task-src', 'task-dst');

      const dstResult = await svc.getContext('task-dst');
      expect(dstResult.ok).toBe(true);
      if (!dstResult.ok) return;
      const dstEntryId = dstResult.data.entries[0].id;

      expect(dstEntryId).not.toBe(srcEntryId);
    });

    it('should update task_id on transferred entries', async () => {
      await svc.createContext('task-src', 'metadata', { k: 1 });
      await svc.transferContext('task-src', 'task-dst');

      const dstResult = await svc.getContext('task-dst');
      expect(dstResult.ok).toBe(true);
      if (!dstResult.ok) return;
      expect(dstResult.data.entries[0].task_id).toBe('task-dst');
    });

    it('should leave source context intact after transfer', async () => {
      await svc.createContext('task-src', 'metadata', { k: 1 });
      await svc.transferContext('task-src', 'task-dst');

      const srcResult = await svc.getContext('task-src');
      expect(srcResult.ok).toBe(true);
      if (!srcResult.ok) return;
      expect(srcResult.data.entries).toHaveLength(1);
    });

    it('should reject when source and destination are the same', async () => {
      const result = await svc.transferContext('task-1', 'task-1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(400);
      expect(result.error).toContain('must be different');
    });

    it('should return 404 when source has no context', async () => {
      const result = await svc.transferContext('empty-src', 'task-dst');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error).toContain('No context found for source task');
    });

    it('should reject transfer that would exceed destination size limit', async () => {
      // Each payload serializes to ~94 bytes. Set the limit so that the
      // destination can hold one entry but the transfer would push it over.
      const tightSvc = createService({ max_size_bytes: 150 });

      // Source: 94 bytes (fits under 150)
      await tightSvc.createContext('task-src', 'metadata', { payload: 'x'.repeat(80) });

      // Destination: 94 bytes (fits under 150)
      await tightSvc.createContext('task-dst', 'metadata', { payload: 'y'.repeat(80) });

      // Transfer would bring destination to 94 + 94 = 188 > 150
      const result = await tightSvc.transferContext('task-src', 'task-dst');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(413);
      expect(result.error).toContain('exceed context size limit');
      tightSvc.dispose();
    });

    it('should preserve data fidelity during transfer', async () => {
      const complexData = {
        nested: { array: [1, 2, 3], bool: true, str: 'hello' },
        nullVal: null,
      };
      await svc.createContext('task-src', 'intermediate_results', complexData);
      await svc.transferContext('task-src', 'task-dst');

      const dstResult = await svc.getContext('task-dst');
      expect(dstResult.ok).toBe(true);
      if (!dstResult.ok) return;
      expect(dstResult.data.entries[0].data).toEqual(complexData);
    });
  });

  // -----------------------------------------------------------------------
  // deleteContext
  // -----------------------------------------------------------------------

  describe('deleteContext', () => {
    it('should delete all context for a task', async () => {
      await svc.createContext('task-1', 'metadata', { a: 1 });
      await svc.createContext('task-1', 'environment', { b: 2 });

      const result = await svc.deleteContext('task-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.task_id).toBe('task-1');
      expect(result.data.deleted).toBe(true);

      // Verify it is gone
      const getResult = await svc.getContext('task-1');
      expect(getResult.ok).toBe(false);
    });

    it('should return 404 when deleting a task with no context', async () => {
      const result = await svc.deleteContext('no-such-task');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.httpStatus).toBe(404);
      expect(result.error).toContain('No context found');
    });

    it('should not affect other tasks', async () => {
      await svc.createContext('task-a', 'metadata', { from: 'a' });
      await svc.createContext('task-b', 'metadata', { from: 'b' });

      await svc.deleteContext('task-a');

      const result = await svc.getContext('task-b');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.entries).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple entries & ordering
  // -----------------------------------------------------------------------

  describe('multiple entries per task', () => {
    it('should store and retrieve many entries of different types', async () => {
      for (const type of CONTEXT_TYPES) {
        await svc.createContext('task-multi', type, { type });
      }

      const result = await svc.getContext('task-multi');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.entries).toHaveLength(CONTEXT_TYPES.length);
    });

    it('should allow duplicate entries of the same type', async () => {
      await svc.createContext('task-1', 'metadata', { v: 1 });
      await svc.createContext('task-1', 'metadata', { v: 2 });
      await svc.createContext('task-1', 'metadata', { v: 3 });

      const result = await svc.getContextByType('task-1', 'metadata');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(3);
    });

    it('should assign unique IDs to every entry', async () => {
      await svc.createContext('task-1', 'metadata', { a: 1 });
      await svc.createContext('task-1', 'metadata', { a: 2 });

      const result = await svc.getContext('task-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const ids = result.data.entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // -----------------------------------------------------------------------
  // Helpers: getStore, getConfig, dispose
  // -----------------------------------------------------------------------

  describe('helpers', () => {
    it('getStore should return the underlying store', () => {
      expect(svc.getStore()).toBeDefined();
    });

    it('getConfig should return configuration', () => {
      const config = svc.getConfig();
      expect(config.ttl_ms).toBe(60_000);
      expect(config.max_size_bytes).toBe(10 * 1024 * 1024);
    });

    it('dispose should not throw', () => {
      expect(() => svc.dispose()).not.toThrow();
    });
  });
});

// ===========================================================================
// InMemoryContextStore — TTL behaviour
// ===========================================================================

describe('InMemoryContextStore', () => {
  it('should expire entries after TTL', async () => {
    // Use a very short TTL
    const store = new InMemoryContextStore(50, 0);
    const entry: ContextEntry = {
      id: 'ctx-test-1',
      task_id: 'task-ttl',
      type: 'metadata',
      data: { hello: 'world' },
      size_bytes: 17,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.set('task-ttl', entry);

    // Immediately available
    let entries = await store.getAll('task-ttl');
    expect(entries).toHaveLength(1);

    // Wait for TTL to elapse
    await new Promise((resolve) => setTimeout(resolve, 80));

    entries = await store.getAll('task-ttl');
    expect(entries).toHaveLength(0);

    store.dispose();
  });

  it('clear should remove all data', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const entry: ContextEntry = {
      id: 'ctx-clear-1',
      task_id: 'task-clear',
      type: 'metadata',
      data: {},
      size_bytes: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.set('task-clear', entry);
    expect(store.taskCount).toBe(1);

    store.clear();
    expect(store.taskCount).toBe(0);

    store.dispose();
  });

  it('taskCount should reflect distinct tasks', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const makeEntry = (id: string, taskId: string): ContextEntry => ({
      id,
      task_id: taskId,
      type: 'metadata',
      data: {},
      size_bytes: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await store.set('task-a', makeEntry('e1', 'task-a'));
    await store.set('task-b', makeEntry('e2', 'task-b'));
    await store.set('task-a', makeEntry('e3', 'task-a')); // second entry for task-a

    expect(store.taskCount).toBe(2);

    store.dispose();
  });

  it('deleteAll should return false for non-existent task', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const deleted = await store.deleteAll('ghost');
    expect(deleted).toBe(false);
    store.dispose();
  });

  it('deleteAll should return true when task had entries', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const entry: ContextEntry = {
      id: 'ctx-del-1',
      task_id: 'task-del',
      type: 'metadata',
      data: {},
      size_bytes: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.set('task-del', entry);
    const deleted = await store.deleteAll('task-del');
    expect(deleted).toBe(true);
    store.dispose();
  });

  it('getTotalSize should sum size_bytes of all entries for a task', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const makeEntry = (id: string, size: number): ContextEntry => ({
      id,
      task_id: 'task-size',
      type: 'metadata',
      data: {},
      size_bytes: size,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await store.set('task-size', makeEntry('e1', 100));
    await store.set('task-size', makeEntry('e2', 250));

    const total = await store.getTotalSize('task-size');
    expect(total).toBe(350);

    store.dispose();
  });

  it('getByType should filter entries', async () => {
    const store = new InMemoryContextStore(60_000, 0);
    const makeEntry = (id: string, type: ContextType): ContextEntry => ({
      id,
      task_id: 'task-filter',
      type,
      data: {},
      size_bytes: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await store.set('task-filter', makeEntry('e1', 'metadata'));
    await store.set('task-filter', makeEntry('e2', 'environment'));
    await store.set('task-filter', makeEntry('e3', 'metadata'));

    const results = await store.getByType('task-filter', 'metadata');
    expect(results).toHaveLength(2);
    results.forEach((e) => expect(e.type).toBe('metadata'));

    store.dispose();
  });
});

// ===========================================================================
// Singleton
// ===========================================================================

describe('Singleton', () => {
  beforeEach(() => {
    resetContextBridgeService();
  });

  afterEach(() => {
    resetContextBridgeService();
  });

  it('should return the same instance on repeated calls', () => {
    const a = getContextBridgeService();
    const b = getContextBridgeService();
    expect(a).toBe(b);
  });

  it('should return a fresh instance after reset', () => {
    const a = getContextBridgeService();
    resetContextBridgeService();
    const b = getContextBridgeService();
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// CONTEXT_TYPES constant
// ===========================================================================

describe('CONTEXT_TYPES', () => {
  it('should contain the five expected types', () => {
    expect(CONTEXT_TYPES).toContain('workspace_files');
    expect(CONTEXT_TYPES).toContain('conversation_history');
    expect(CONTEXT_TYPES).toContain('intermediate_results');
    expect(CONTEXT_TYPES).toContain('environment');
    expect(CONTEXT_TYPES).toContain('metadata');
    expect(CONTEXT_TYPES).toHaveLength(5);
  });
});
