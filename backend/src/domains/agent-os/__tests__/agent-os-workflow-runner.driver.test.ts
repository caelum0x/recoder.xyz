/**
 * `AgentOsWorkflowRunnerDriver` — the concrete `WorkflowDriver` skinning the
 * frozen `@recoder/agent-workflows` runner. Verifies: `start` executes a
 * definition through the runner and retains the run; a handler-injected node
 * completes; a handler-less node degrades to a truthful `failed` run; an
 * approval node parks `waiting`; `cancel` marks a tracked non-terminal run
 * `cancelled` (idempotent on terminal, rejects unknown id); `signal` delegates
 * `cancel` and rejects non-resumable signals truthfully.
 */
import { describe, it, expect } from 'vitest';
import type {
  AgentOsWorkflowRunnerPorts,
  WorkflowDefinition,
} from '@recoder/agent-workflows';
import { AgentOsWorkflowRunnerDriver } from '../adapters/agent-os-workflow-runner.driver.js';

function def(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    workflowId: 'wf-1',
    name: 'Verify then ship',
    version: '1.0.0',
    nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', config: {} }],
    ...overrides,
  };
}

describe('AgentOsWorkflowRunnerDriver', () => {
  it('start executes a handler-backed definition to completion and retains the run', async () => {
    const ports: AgentOsWorkflowRunnerPorts = {
      runVerification: async () => ({ status: 'completed', output: { ok: true } }),
    };
    const driver = new AgentOsWorkflowRunnerDriver({ ports });

    const run = await driver.start(def());
    expect(run.workflowId).toBe('wf-1');
    expect(run.status).toBe('completed');
    // The run is addressable by id afterwards (cancel/signal target it).
    expect(driver.getRun(run.workflowRunId)).toMatchObject({ status: 'completed' });
  });

  it('start degrades to a truthful failed run when a node has no handler', async () => {
    const driver = new AgentOsWorkflowRunnerDriver();
    const run = await driver.start(def());
    expect(run.status).toBe('failed');
    // The failure is surfaced, never faked as success.
    const failure = run.nodeExecutions?.find((n) => n.status === 'failed');
    expect(failure?.error).toContain('verification handler');
  });

  it('an approval node parks the run in waiting (never a hard failure)', async () => {
    const driver = new AgentOsWorkflowRunnerDriver();
    const run = await driver.start(
      def({ nodes: [{ nodeId: 'gate', kind: 'approval', label: 'Gate', config: {} }] }),
    );
    expect(run.status).toBe('waiting');
  });

  it('cancel marks a tracked non-terminal run cancelled and is idempotent', async () => {
    const driver = new AgentOsWorkflowRunnerDriver({ now: () => '2026-07-18T00:00:00.000Z' });
    const run = await driver.start(
      def({ nodes: [{ nodeId: 'gate', kind: 'approval', label: 'Gate', config: {} }] }),
    );
    expect(run.status).toBe('waiting');

    await driver.cancel(run.workflowRunId);
    expect(driver.getRun(run.workflowRunId)).toMatchObject({
      status: 'cancelled',
      completedAt: '2026-07-18T00:00:00.000Z',
    });

    // Idempotent no-op on an already-terminal run.
    await expect(driver.cancel(run.workflowRunId)).resolves.toBeUndefined();
    expect(driver.getRun(run.workflowRunId)?.status).toBe('cancelled');
  });

  it('cancel rejects an unknown run id (never fabricates a cancellation)', async () => {
    const driver = new AgentOsWorkflowRunnerDriver();
    await expect(driver.cancel('nope')).rejects.toThrow('unknown workflow run: nope');
    expect(driver.getRun('nope')).toBeNull();
  });

  it('signal(cancel) delegates to cancel', async () => {
    const driver = new AgentOsWorkflowRunnerDriver();
    const run = await driver.start(
      def({ nodes: [{ nodeId: 'gate', kind: 'approval', label: 'Gate', config: {} }] }),
    );
    await driver.signal(run.workflowRunId, { type: 'cancel', reason: 'abort' });
    expect(driver.getRun(run.workflowRunId)?.status).toBe('cancelled');
  });

  it('signal rejects a non-cancel signal truthfully (no durable resume)', async () => {
    const driver = new AgentOsWorkflowRunnerDriver();
    const run = await driver.start(
      def({ nodes: [{ nodeId: 'gate', kind: 'approval', label: 'Gate', config: {} }] }),
    );
    await expect(
      driver.signal(run.workflowRunId, { type: 'input', nodeId: 'gate', data: {} }),
    ).rejects.toThrow('no durable resume seam');
  });
});
