import { describe, expect, it } from 'vitest';
import { buildSubagentWorkflowPlan, __internal } from './subagent-workflow.server';

describe('buildSubagentWorkflowPlan', () => {
  it('builds full lane plan by default', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'Develop continuously with subagents',
    });
    expect(plan.mode).toBe('continuous');
    expect(plan.lanes.length).toBeGreaterThanOrEqual(10);
    expect(plan.summary).toContain('Scope:');
  });

  it('filters lanes by requested paths', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'Desktop only',
      requestedPaths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'],
    });
    expect(plan.lanes.map((lane) => lane.laneId)).toEqual(['A2']);
  });

  it('supports single-task mode', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'One shot refactor',
      continuous: false,
      requestedPaths: ['/Users/arhansubasi/recoder.xyz/openclaw'],
    });
    expect(plan.mode).toBe('single-task');
    expect(plan.lanes.map((lane) => lane.laneId)).toEqual(['A7']);
  });
});

describe('docker-backend contract parity', () => {
  it('produces orchestration metadata', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'test' });
    expect(plan.orchestration).toBeDefined();
    expect(Array.isArray(plan.orchestration.executionWaves)).toBe(true);
    expect(plan.orchestration.executionWaves.length).toBeGreaterThan(0);
    expect(Array.isArray(plan.orchestration.unresolvedLanes)).toBe(true);
    expect(typeof plan.orchestration.delegatedAgents).toBe('object');
    expect(typeof plan.orchestration.totalRetryBudget.maxRetries).toBe('number');
    expect(typeof plan.orchestration.totalRetryBudget.maxBackoffMs).toBe('number');
    expect(Array.isArray(plan.orchestration.visibilitySignals)).toBe(true);
  });

  it('attaches delegation, dependency, retry, and visibility to each lane', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'test' });
    for (const lane of plan.lanes) {
      expect(typeof lane.delegatesTo).toBe('string');
      expect(Array.isArray(lane.dependsOn)).toBe(true);
      expect(Array.isArray(lane.externalDependsOn)).toBe(true);
      expect(lane.retryBudget).toBeDefined();
      expect(typeof lane.retryBudget!.maxRetries).toBe('number');
      expect(typeof lane.retryBudget!.backoffMs).toBe('number');
      expect(Array.isArray(lane.visibility)).toBe(true);
    }
  });

  it('A6 (docker-backend) has no internal dependencies', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'test' });
    const a6 = plan.lanes.find((lane) => lane.laneId === 'A6');
    expect(a6).toBeDefined();
    expect(a6!.dependsOn).toEqual([]);
  });

  it('A1 depends on A6 when both are in scope', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'test' });
    const a1 = plan.lanes.find((lane) => lane.laneId === 'A1');
    expect(a1).toBeDefined();
    expect(a1!.dependsOn).toContain('A6');
  });

  it('marks external dependencies when dep lane is out of scope', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'test',
      requestedPaths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'],
    });
    const a2 = plan.lanes.find((lane) => lane.laneId === 'A2');
    expect(a2).toBeDefined();
    // A2 depends on A7 and A6, but neither is in scope when only desktop is selected
    expect(a2!.externalDependsOn).toContain('A7');
    expect(a2!.externalDependsOn).toContain('A6');
    expect(a2!.dependsOn).toEqual([]);
  });

  it('adds external dependency warning to nextActions', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'test',
      requestedPaths: ['/Users/arhansubasi/recoder.xyz/apps/desktop'],
    });
    expect(plan.nextActions.some((a) => a.includes('excludes some lane dependencies'))).toBe(true);
  });

  it('execution waves respect dependency order', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'test' });
    const waves = plan.orchestration.executionWaves;
    // A6 has no deps → should be in wave 0
    expect(waves[0]).toContain('A6');
    // A1 depends on A6 → should be in a later wave
    const a6wave = waves.findIndex((w) => w.includes('A6'));
    const a1wave = waves.findIndex((w) => w.includes('A1'));
    expect(a1wave).toBeGreaterThan(a6wave);
  });

  it('lane catalog matches docker-backend lane IDs', () => {
    const expectedLaneIds = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12'];
    const catalogLaneIds = __internal.LANE_CATALOG.map((lane) => lane.laneId);
    expect(catalogLaneIds).toEqual(expectedLaneIds);
  });

  it('default repo paths match docker-backend', () => {
    const expectedPaths = [
      '/Users/arhansubasi/recoder.xyz/app',
      '/Users/arhansubasi/recoder.xyz/apps/desktop',
      '/Users/arhansubasi/recoder.xyz/apps/frontend',
      '/Users/arhansubasi/recoder.xyz/apps/mobile',
      '/Users/arhansubasi/recoder.xyz/recoder-studio',
      '/Users/arhansubasi/recoder.xyz/apps/ui.giselles.ai',
      '/Users/arhansubasi/recoder.xyz/backend',
      '/Users/arhansubasi/recoder.xyz/docker-backend',
      '/Users/arhansubasi/recoder.xyz/openclaw',
      '/Users/arhansubasi/recoder.xyz/packages',
      '/Users/arhansubasi/recoder.xyz/recoder-agency',
      '/Users/arhansubasi/recoder.xyz/recoder-pm',
      '/Users/arhansubasi/recoder.xyz/recoder-skill',
      '/Users/arhansubasi/recoder.xyz/recoder-web',
      '/Users/arhansubasi/recoder.xyz/tools',
    ];
    expect([...__internal.DEFAULT_REPO_PATHS]).toEqual(expectedPaths);
  });

  it('custom retry budget propagates to all lanes', () => {
    const plan = buildSubagentWorkflowPlan({
      task: 'test',
      retryMax: 5,
      retryBackoffMs: 1000,
    });
    for (const lane of plan.lanes) {
      expect(lane.retryBudget).toEqual({ maxRetries: 5, backoffMs: 1000 });
    }
  });

  it('summary format matches docker-backend: Task ... | Scope ...', () => {
    const plan = buildSubagentWorkflowPlan({ task: 'run tests' });
    expect(plan.summary).toMatch(/^Task: .+ \| Scope: .+$/);
  });
});
