import { describe, expect, it } from 'vitest';
import type { TaskSpec } from '@recoder/agent-os';
import {
  CONSERVATIVE_DEFAULT_DECISION,
  computePalPlanDecision,
} from './plan-capability';

const FIXED_NOW = '2026-07-13T00:00:00.000Z';
const clock = () => FIXED_NOW;

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

describe('computePalPlanDecision — normal tasks', () => {
  it('maps a benign feature task to a low-risk, no-approval decision', () => {
    const result = computePalPlanDecision(makeTask(), { now: clock });

    expect(result.status).toBe('planned');
    expect(result.decision.risk).toBe('low');
    expect(result.decision.approvalRequired).toBe(false);
    expect(result.decision.runtimeId).toBe('claude_code');
    expect(result.decision.substrate).toBe('local_container');
    expect(result.decision.toolGrants).toContain('recoder.tasks');
    expect(result.plan?.generatedAt).toBe(FIXED_NOW);
  });

  it('flags high risk and forces approval for sensitive paths (deny-bias)', () => {
    const result = computePalPlanDecision(
      makeTask({ targetPaths: ['packages/auth/src/session.ts'], intent: 'platform_hardening' }),
      { now: clock },
    );

    expect(result.status).toBe('planned');
    expect(result.decision.risk).toBe('high');
    expect(result.decision.approvalRequired).toBe(true);
    // high risk routes to the isolated sandbox
    expect(result.decision.substrate).toBe('daytona');
  });

  it('requires approval when the task carries explicit approval reasons', () => {
    const result = computePalPlanDecision(
      makeTask({ approvalRequired: ['deploy to production'] }),
      { now: clock },
    );

    expect(result.status).toBe('planned');
    expect(result.decision.approvalRequired).toBe(true);
  });

  it('grants browser/preview tools only when browser checks are requested', () => {
    const withBrowser = computePalPlanDecision(
      makeTask({ verification: { commands: [], browserChecks: ['load /'] } }),
      { now: clock },
    );
    expect(withBrowser.decision.toolGrants).toContain('recoder.browser');

    const withoutBrowser = computePalPlanDecision(makeTask(), { now: clock });
    expect(withoutBrowser.decision.toolGrants).not.toContain('recoder.browser');
  });
});

describe('computePalPlanDecision — degrade-safe defaults', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not-a-task'],
    ['a number', 42],
    ['an array', ['taskId']],
    ['an empty object', {}],
    ['an object without taskId', { title: 'no id', targetPaths: ['x'] }],
    ['a blank taskId', { taskId: '   ' }],
  ])('returns the conservative deny-biased default for %s', (_label, input) => {
    const result = computePalPlanDecision(input, { now: clock });

    expect(result.status).toBe('degraded_default');
    expect(result.decision).toEqual(CONSERVATIVE_DEFAULT_DECISION);
    expect(result.decision.approvalRequired).toBe(true);
    expect(result.decision.toolGrants).toEqual([]);
    expect(result.decision.risk).toBe('high');
    expect(result.reason).toBeTruthy();
    expect(result.plan).toBeUndefined();
  });

  it('never throws and stays deny-biased on malformed field types', () => {
    const result = computePalPlanDecision(
      {
        taskId: 'task-x',
        targetPaths: 'packages/auth/src/session.ts', // wrong type: string not array
        verification: 'nope',
        approvalRequired: { not: 'an array' },
      },
      { now: clock },
    );

    // Coercion drops the bad fields → planner still runs → truthful planned result.
    expect(result.status).toBe('planned');
    expect(result.decision.approvalRequired).toBe(false);
  });

  it('does not let a throwing clock crash the capability', () => {
    const result = computePalPlanDecision(makeTask(), {
      now: () => {
        throw new Error('clock exploded');
      },
    });

    expect(result.status).toBe('planned');
    expect(typeof result.plan?.generatedAt).toBe('string');
  });

  it('returns a fresh (mutation-safe) default decision each call', () => {
    const a = computePalPlanDecision(undefined, { now: clock });
    a.decision.toolGrants.push('recoder.deploy');
    const b = computePalPlanDecision(undefined, { now: clock });

    expect(b.decision.toolGrants).toEqual([]);
    expect(CONSERVATIVE_DEFAULT_DECISION.toolGrants).toEqual([]);
  });
});
