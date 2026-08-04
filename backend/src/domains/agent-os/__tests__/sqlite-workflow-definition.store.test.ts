/**
 * Restart-durability e2e for the sqlite `WorkflowDefinitionStore` (DB-less
 * desktop): write definitions, CLOSE the connection, reopen a FRESH store on the
 * same file, and assert every definition survived — the proof that closes the
 * gap where solo-mode workflow definitions were lost on restart (only postgres
 * was durable before). Also asserts contract parity with the pg + in-memory
 * stores: last-write-wins upsert, insertion-order `list`, and `delete` reporting
 * whether a row was removed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import type { WorkflowDefinition } from '@recoder/agent-workflows';
import { SqliteWorkflowDefinitionStore } from '../adapters/sqlite-workflow-definition.store.js';

const dir = mkdtempSync(join(tmpdir(), 'agentos-workflow-sqlite-'));
const dbPath = join(dir, 'state.sqlite');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function def(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    workflowId: 'wf-1',
    name: 'Verify then ship',
    version: '1.0.0',
    nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', config: {} }],
    ...overrides,
  };
}

describe('SqliteWorkflowDefinitionStore', () => {
  it('survives a restart: definitions reopen on the same file', () => {
    const first = new SqliteWorkflowDefinitionStore(dbPath);
    first.upsert(def({ workflowId: 'wf-a' }));
    first.upsert(def({ workflowId: 'wf-b', name: 'Second' }));
    first.close();

    // Fresh store, same file — nothing held in process memory.
    const reopened = new SqliteWorkflowDefinitionStore(dbPath);
    try {
      expect(reopened.get('wf-a')).toEqual(def({ workflowId: 'wf-a' }));
      expect(reopened.get('wf-b')).toEqual(def({ workflowId: 'wf-b', name: 'Second' }));
      expect(reopened.list().map((d) => d.workflowId)).toEqual(['wf-a', 'wf-b']);
    } finally {
      reopened.close();
    }
  });

  it('upsert is last-write-wins and preserves insertion order', () => {
    const isolated = join(mkdtempSync(join(tmpdir(), 'agentos-workflow-sqlite-')), 'db.sqlite');
    const store = new SqliteWorkflowDefinitionStore(isolated);
    try {
      store.upsert(def({ workflowId: 'wf-x' }));
      store.upsert(def({ workflowId: 'wf-y' }));
      store.upsert(def({ workflowId: 'wf-x', name: 'Renamed' }));

      const rows = store.list();
      expect(rows.map((d) => d.workflowId)).toEqual(['wf-x', 'wf-y']);
      expect(store.get('wf-x')).toMatchObject({ name: 'Renamed' });
    } finally {
      store.close();
    }
  });

  it('get returns null for unknown ids; delete reports removal', () => {
    const isolated = join(mkdtempSync(join(tmpdir(), 'agentos-workflow-sqlite-')), 'db.sqlite');
    const store = new SqliteWorkflowDefinitionStore(isolated);
    try {
      expect(store.get('nope')).toBeNull();
      expect(store.list()).toEqual([]);

      store.upsert(def());
      expect(store.delete('wf-1')).toBe(true);
      expect(store.delete('wf-1')).toBe(false);
      expect(store.get('wf-1')).toBeNull();
    } finally {
      store.close();
    }
  });
});
