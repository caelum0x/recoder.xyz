import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AgentOsWorkflowRunner } from './workflow-runner';
import type { WorkflowDefinition, WorkflowNode } from './workflow-definition';
import {
  verificationNode,
  approvalWaitNode,
  openPrNode,
  deployNode,
} from './nodes/index';

function deliveryDefinition(): WorkflowDefinition {
  const verify = verificationNode('verify', { workspaceId: 'ws1' });
  const approve: WorkflowNode = { ...approvalWaitNode('approve', { reason: 'release' }), dependsOn: [verify.nodeId] };
  const pr: WorkflowNode = {
    ...openPrNode('pr', { repo: 'r/x', branch: 'feat', title: 'Ship it' }),
    dependsOn: [approve.nodeId],
  };
  const deploy: WorkflowNode = {
    ...deployNode('deploy', { environment: 'production' }),
    dependsOn: [pr.nodeId],
  };
  return {
    workflowId: 'delivery',
    name: 'Delivery pipeline',
    version: '1',
    nodes: [verify, approve, pr, deploy],
  };
}

test('approval-wait parks the run in waiting with no approval handler', async () => {
  const runner = new AgentOsWorkflowRunner({
    runVerification: async () => ({ status: 'completed' }),
  });
  const run = await runner.run({ definition: deliveryDefinition() });

  assert.equal(run.status, 'waiting');
  const approveExec = run.nodeExecutions?.find((e) => e.nodeId === 'approve');
  assert.equal(approveExec?.status, 'waiting');
  // Downstream pr/deploy must NOT have executed while the gate is parked.
  assert.equal(run.nodeExecutions?.find((e) => e.nodeId === 'pr'), undefined);
  assert.equal(run.nodeExecutions?.find((e) => e.nodeId === 'deploy'), undefined);
});

test('full verify->approve->pr->deploy completes when all handlers resolve', async () => {
  const order: string[] = [];
  const runner = new AgentOsWorkflowRunner({
    runVerification: async () => {
      order.push('verify');
      return { status: 'completed' };
    },
    requestApproval: async () => {
      order.push('approve');
      return { status: 'completed', output: { approved: true } };
    },
    openPullRequest: async (node) => {
      order.push('pr');
      return { status: 'completed', output: { url: `https://example/${node.config.branch}` } };
    },
    runDeploy: async (node) => {
      order.push('deploy');
      return { status: 'completed', output: { environment: node.config.environment } };
    },
  });

  const run = await runner.run({ definition: deliveryDefinition() });

  assert.equal(run.status, 'completed');
  assert.deepEqual(order, ['verify', 'approve', 'pr', 'deploy']);
  const deployExec = run.nodeExecutions?.find((e) => e.nodeId === 'deploy');
  assert.equal(deployExec?.status, 'completed');
  assert.equal(deployExec?.output?.environment, 'production');
});

test('a failed deploy fails the run', async () => {
  const runner = new AgentOsWorkflowRunner({
    runVerification: async () => ({ status: 'completed' }),
    requestApproval: async () => ({ status: 'completed' }),
    openPullRequest: async () => ({ status: 'completed' }),
    runDeploy: async () => ({ status: 'failed', error: 'deploy rejected' }),
  });
  const run = await runner.run({ definition: deliveryDefinition() });
  assert.equal(run.status, 'failed');
});

test('missing pull-request handler throws a clear node error (failing the run)', async () => {
  const runner = new AgentOsWorkflowRunner({
    runVerification: async () => ({ status: 'completed' }),
    requestApproval: async () => ({ status: 'completed' }),
    // no openPullRequest configured
  });
  const run = await runner.run({ definition: deliveryDefinition() });
  assert.equal(run.status, 'failed');
  const failure = run.nodeExecutions?.find((e) => e.status === 'failed');
  assert.match(failure?.error ?? '', /pull-request handler/);
});
