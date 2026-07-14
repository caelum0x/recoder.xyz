/**
 * Table-driven decision tests over the pal planning pipeline:
 * goal/scope → expected runtime + risk + approval + sandbox.
 *
 * Risk/approval logic here is Recoder-native (risk-model.ts,
 * approval-estimator.ts) — modules/communication/pal-mcp-server has no risk-tier or
 * approval-gate computation. These tables pin the current contract.
 */
import { describe, expect, it } from 'vitest';
import type { TaskSpec } from '@recoder/agent-os';

import { planTask } from './planner';
import { estimateTaskRisk, type RiskLevel } from './risk-model';
import { estimateApprovalGates } from './approval-estimator';
import type { RuntimeChoice } from './agent-team';
import type { SandboxChoice } from './sandbox-selector';

const FIXED_NOW = '2026-07-14T00:00:00.000Z';

function makeTask(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    taskId: 'task-1',
    title: 'Add a feature',
    intent: 'feature_delivery',
    goal: 'Ship the thing',
    spaceId: 'space-1',
    targetPaths: ['packages/widget/src/index.ts'],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: ['pnpm test'] },
    approvalRequired: [],
    artifactRequired: [],
    ...overrides,
  };
}

type DecisionCase = {
  name: string;
  overrides: Partial<TaskSpec>;
  expected: {
    primaryRuntime: RuntimeChoice;
    risk: RiskLevel;
    approvalGateCount: number;
    sandbox: SandboxChoice;
  };
};

const decisionTable: DecisionCase[] = [
  {
    name: 'benign feature in a widget package',
    overrides: {},
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'low',
      approvalGateCount: 0,
      sandbox: 'local_container',
    },
  },
  {
    name: 'auth-path hardening is high risk and approval-gated',
    overrides: {
      intent: 'platform_hardening',
      goal: 'Harden session handling',
      targetPaths: ['packages/auth/src/session.ts'],
    },
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'high',
      approvalGateCount: 1,
      sandbox: 'daytona',
    },
  },
  {
    name: 'billing change is high risk and approval-gated',
    overrides: {
      goal: 'Update billing webhooks',
      targetPaths: ['backend/src/billing/webhooks.ts'],
    },
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'high',
      approvalGateCount: 1,
      sandbox: 'daytona',
    },
  },
  {
    name: 'backend API change is medium risk without approvals',
    overrides: {
      goal: 'Add an API route',
      targetPaths: ['backend/src/api/routes.ts'],
    },
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'medium',
      approvalGateCount: 0,
      sandbox: 'local_container',
    },
  },
  {
    name: 'code review routes to codex primary',
    overrides: {
      intent: 'code_review',
      goal: 'Review the diff',
    },
    expected: {
      primaryRuntime: 'codex',
      risk: 'low',
      approvalGateCount: 0,
      sandbox: 'local_container',
    },
  },
  {
    name: 'research runs without a sandbox',
    overrides: {
      intent: 'research',
      goal: 'Survey retrieval libraries',
      targetPaths: [],
    },
    expected: {
      primaryRuntime: 'codex',
      risk: 'low',
      approvalGateCount: 0,
      sandbox: 'none',
    },
  },
  {
    name: 'explicit approval reasons produce explicit gates',
    overrides: {
      intent: 'release',
      goal: 'Deploy to production',
      approvalRequired: ['deploy to production'],
    },
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'low',
      approvalGateCount: 1,
      sandbox: 'local_container',
    },
  },
  {
    name: 'explicit + sensitive-path approvals stack',
    overrides: {
      goal: 'Rotate secrets and deploy',
      targetPaths: ['backend/src/secrets/store.ts'],
      approvalRequired: ['rotate production secrets'],
    },
    expected: {
      primaryRuntime: 'claude_code',
      risk: 'high',
      approvalGateCount: 2,
      sandbox: 'daytona',
    },
  },
];

describe('planTask decision table (goal/scope → runtime + risk + approval)', () => {
  it.each(decisionTable.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const task = makeTask(testCase.overrides);
    const plan = planTask(task, FIXED_NOW);

    expect(plan.primaryRuntime).toBe(testCase.expected.primaryRuntime);
    expect(plan.risk).toBe(testCase.expected.risk);
    expect(plan.approvalGateIds).toHaveLength(testCase.expected.approvalGateCount);
    expect(plan.sandbox).toBe(testCase.expected.sandbox);
    expect(plan.generatedAt).toBe(FIXED_NOW);
  });

  it('risk estimates and approval gates agree with the plan output', () => {
    const task = makeTask({
      targetPaths: ['backend/src/billing/webhooks.ts'],
      approvalRequired: ['ship billing change'],
    });
    const plan = planTask(task, FIXED_NOW);
    const approvals = estimateApprovalGates(task, FIXED_NOW);

    expect(estimateTaskRisk(task)).toBe(plan.risk);
    expect(approvals.map((a) => a.approvalId)).toEqual(plan.approvalGateIds);
    expect(approvals.every((a) => a.status === 'pending')).toBe(true);
  });
});
