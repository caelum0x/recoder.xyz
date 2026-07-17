/**
 * `WorkflowService` — CRUD over the in-memory store, validation via the frozen
 * `@recoder/agent-workflows` contract, and truthful dispatch (degrades to
 * `not_configured` with no driver; runs through the injected `WorkflowDriver`
 * when wired).
 */
import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition, WorkflowDriver, WorkflowRun } from '@recoder/agent-workflows';
import {
  WorkflowService,
  WorkflowValidationError,
  InMemoryWorkflowDefinitionStore,
} from '../services/workflow.service.js';

function def(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    workflowId: 'wf-1',
    name: 'Verify then ship',
    version: '1.0.0',
    nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', config: {} }],
    ...overrides,
  };
}

describe('WorkflowService', () => {
  it('saves + lists + gets + deletes definitions', async () => {
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() });
    expect(await svc.list()).toEqual([]);

    const saved = await svc.save(def());
    expect(saved.workflowId).toBe('wf-1');
    expect(await svc.list()).toHaveLength(1);
    expect(await svc.get('wf-1')).toMatchObject({ name: 'Verify then ship' });
    expect(await svc.get('missing')).toBeNull();

    expect(await svc.delete('wf-1')).toBe(true);
    expect(await svc.delete('wf-1')).toBe(false);
    expect(await svc.list()).toEqual([]);
  });

  it('rejects a structurally-invalid definition (no faked persist)', async () => {
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() });
    await expect(
      svc.save(def({ nodes: [{ nodeId: 'a', kind: 'tool', label: 'A', dependsOn: ['ghost'], config: {} }] })),
    ).rejects.toBeInstanceOf(WorkflowValidationError);
    expect(await svc.list()).toEqual([]);
  });

  it('dispatch degrades truthfully when no driver is wired', async () => {
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() });
    expect(svc.dispatchConfigured).toBe(false);
    const result = await svc.dispatch(def());
    expect(result).toMatchObject({ dispatched: false, status: 'not_configured', workflowId: 'wf-1' });
    expect(result.reason).toContain('no workflow driver');
  });

  it('dispatch runs through the injected WorkflowDriver contract', async () => {
    const run: WorkflowRun = {
      workflowRunId: 'run-1',
      workflowId: 'wf-1',
      status: 'running',
      startedAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    let started: string | undefined;
    const driver: WorkflowDriver = {
      async start(d) {
        started = d.workflowId;
        return run;
      },
      async signal() {},
      async cancel() {},
    };
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore(), driver });
    expect(svc.dispatchConfigured).toBe(true);
    const result = await svc.dispatch(def());
    expect(started).toBe('wf-1');
    expect(result).toMatchObject({ dispatched: true, status: 'dispatched', run: { workflowRunId: 'run-1' } });
  });
});
