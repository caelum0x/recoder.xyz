import { describe, expect, it } from 'vitest';
import {
  INTERNAL_WORKFLOW_CONTRACT,
  PUBLIC_WORKFLOW_CONTRACT,
  PUBLIC_WORKFLOW_HEALTH_CONTRACT,
  buildSubagentWorkflowHealthSummary,
  buildInternalWorkflowResponse,
  buildPublicWorkflowResponseData,
  buildSubagentWorkflowPlan,
  isKnownSubagentLaneId,
  parseSubagentLaneStatusUpdate,
  parseSubagentWorkflowRequest,
  validateSubagentWorkflowRequestContract,
  WORKFLOW_REQUEST_CONTRACT_ERROR_CODE,
  WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA,
} from './subagent-workflow.js';

describe('buildSubagentWorkflowPlan', () => {
  it('returns continuous mode by default', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'ship features' });
    expect(plan.mode).toBe('continuous');
    expect(plan.lanes.length).toBeGreaterThan(0);
    expect(plan.orchestration.executionWaves.length).toBeGreaterThan(0);
    expect(plan.orchestration.totalRetryBudget.maxRetries).toBeGreaterThan(0);
  });

  it('supports narrowed scope by requested paths', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'desktop only',
      requestedPaths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'],
      continuous: false,
    });

    expect(plan.mode).toBe('single-task');
    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]?.laneId).toBe('A2');
    expect(plan.lanes[0]?.dependsOn).toEqual([]);
    expect(plan.lanes[0]?.externalDependsOn).toEqual(['A7', 'A6']);
    expect(plan.nextActions.join(' ')).toContain('Selected scope excludes some lane dependencies');
  });

  it('supports lane targeting and retry override', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'openclaw only',
      requestedLanes: ['A7'],
      retryMax: 5,
      retryBackoffMs: 900,
    });

    expect(plan.lanes).toHaveLength(1);
    expect(plan.lanes[0]?.laneId).toBe('A7');
    expect(plan.lanes[0]?.retryBudget).toEqual({ maxRetries: 5, backoffMs: 900 });
    expect(plan.orchestration.executionWaves).toEqual([['A7']]);
  });
});

describe('subagent workflow request/response contracts', () => {
  it('parses workflow request defaults and sanitizes paths', () => {
    const parsed = parseSubagentWorkflowRequest({
      requestContract: INTERNAL_WORKFLOW_CONTRACT,
      task: '  ',
      paths: ['/Users/arhansubasi/recoder.xyz/openclaw', '', 42],
      lanes: ['a7', 'bad', 88],
      retryMax: 6,
      retryBackoffMs: 700,
    });
    expect(parsed.requestContract).toBe(INTERNAL_WORKFLOW_CONTRACT);
    expect(parsed.task).toBe('continuous subagent workflow');
    expect(parsed.continuous).toBe(true);
    expect(parsed.paths).toEqual(['/Users/arhansubasi/recoder.xyz/openclaw']);
    expect(parsed.lanes).toEqual(['A7']);
    expect(parsed.retryMax).toBe(6);
    expect(parsed.retryBackoffMs).toBe(700);
  });

  it('rejects mismatched request contract marker', () => {
    const validation = validateSubagentWorkflowRequestContract(
      PUBLIC_WORKFLOW_CONTRACT,
      INTERNAL_WORKFLOW_CONTRACT,
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe(WORKFLOW_REQUEST_CONTRACT_ERROR_CODE);
    expect(validation.error.schemaVersion).toBe(WORKFLOW_REQUEST_CONTRACT_ERROR_SCHEMA);
    expect(validation.error.issues[0]).toEqual({
      path: 'body.requestContract',
      message: `Expected ${INTERNAL_WORKFLOW_CONTRACT}`,
    });
  });

  it('builds internal contract payload for /api/agent/workflow', () => {
    const workflow = buildSubagentWorkflowPlan({ task: 'ship features' });
    const payload = buildInternalWorkflowResponse({
      workflow,
      requestContract: INTERNAL_WORKFLOW_CONTRACT,
    });
    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Subagent workflow plan generated');
    expect(payload.contract).toBe(INTERNAL_WORKFLOW_CONTRACT);
    expect(payload.responseContract).toBe(INTERNAL_WORKFLOW_CONTRACT);
    expect(payload.requestContract).toBe(INTERNAL_WORKFLOW_CONTRACT);
    expect(payload.workflow).toEqual(workflow);
    expect('projectId' in payload).toBe(false);
  });

  it('builds internal contract payload for /api/agent/workflow/:projectId', () => {
    const workflow = buildSubagentWorkflowPlan({ task: 'ship features' });
    const payload = buildInternalWorkflowResponse({ workflow, projectId: 'proj_123' });
    expect(payload.success).toBe(true);
    expect(payload.contract).toBe(INTERNAL_WORKFLOW_CONTRACT);
    expect(payload.projectId).toBe('proj_123');
    expect(payload.workflow).toEqual(workflow);
  });

  it('builds public API data contract for /api/v1/agent/workflow', () => {
    const workflow = buildSubagentWorkflowPlan({ task: 'ship features' });
    const data = buildPublicWorkflowResponseData({
      workflow,
      requestContract: PUBLIC_WORKFLOW_CONTRACT,
    });
    expect(data.message).toBe('Subagent workflow plan generated');
    expect(data.contract).toBe(PUBLIC_WORKFLOW_CONTRACT);
    expect(data.responseContract).toBe(PUBLIC_WORKFLOW_CONTRACT);
    expect(data.requestContract).toBe(PUBLIC_WORKFLOW_CONTRACT);
    expect(data.workflow).toEqual(workflow);
  });
});

describe('subagent workflow health contracts', () => {
  it('parses lane status updates and rejects invalid payloads', () => {
    expect(parseSubagentLaneStatusUpdate({ status: 'running', attempts: 3, duration: 500 })).toEqual(
      expect.objectContaining({ status: 'running', attempts: 3, duration: 500 }),
    );
    expect(parseSubagentLaneStatusUpdate({ status: 'invalid' })).toBeNull();
  });

  it('validates known lane ids', () => {
    expect(isKnownSubagentLaneId('A7')).toBe(true);
    expect(isKnownSubagentLaneId('X1')).toBe(false);
  });

  it('builds blocked health summary when failed lanes exist', () => {
    const summary = buildSubagentWorkflowHealthSummary({
      statuses: {
        A6: { status: 'failed', attempts: 2, errors: ['boom'], updatedAt: '2026-02-14T00:00:00.000Z' },
        A7: { status: 'running', updatedAt: '2026-02-14T00:00:01.000Z' },
      },
    });
    expect(summary.contract).toBe(PUBLIC_WORKFLOW_HEALTH_CONTRACT);
    expect(summary.taxonomyVersion).toBe('workflow-lane-health-v1');
    expect(summary.state).toBe('blocked');
    expect(summary.failed).toBe(1);
    expect(summary.running).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.blockers.join(' ')).toContain('Failed lanes');
  });

  it('builds degraded health summary when no telemetry is posted', () => {
    const summary = buildSubagentWorkflowHealthSummary({ statuses: {} });
    expect(summary.state).toBe('degraded');
    expect(summary.laneCount).toBe(0);
    expect(summary.warnings.join(' ')).toContain('No lane status telemetry');
  });
});
