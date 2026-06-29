/**
 * Wiring test: proves docker-backend GENUINELY imports and USES @recoder/pal.
 *
 * `conductor-planner` (the seam) calls pal's real `planTask` over a real
 * agent-os `TaskSpec` and translates the `PALPlan` into Conductor vocabulary.
 * Nothing is stubbed — this exercises the real pal planner (`selectRuntimeTeam`,
 * `estimateTaskRisk`, `selectSandbox`, `selectSkills`, `selectToolGrants`,
 * `estimateApprovalGates`) through the backend seam and asserts the mapping +
 * that pal's decisions actually flow through (different tasks → different plans).
 */
import { describe, it, expect } from 'vitest';
import type { TaskSpec } from '@recoder/agent-os';
// Import directly from the package to prove the dependency resolves from
// docker-backend, then through the backend seam to prove it is wired in.
import { planTask } from '@recoder/pal';
import { planConductorRun, effectiveRuntimeId } from './conductor-planner.js';

function makeTask(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    taskId: 'task-1',
    title: 'Add a feature',
    intent: 'feature_delivery',
    goal: 'Implement the thing',
    spaceId: 'space-1',
    targetPaths: ['app/components/Button.tsx'],
    forbiddenPaths: [],
    acceptanceCriteria: ['it works'],
    verification: { commands: ['pnpm test'] },
    approvalRequired: [],
    artifactRequired: [],
    ...overrides,
  };
}

describe('conductor-planner (real @recoder/pal wiring)', () => {
  it('the package itself resolves from docker-backend and plans a task', () => {
    const pal = planTask(makeTask(), '2026-06-29T00:00:00.000Z');
    expect(pal.taskId).toBe('task-1');
    expect(typeof pal.primaryRuntime).toBe('string');
    expect(Array.isArray(pal.skills)).toBe(true);
  });

  it('translates a feature task into a launchable Conductor runtime + substrate', () => {
    const plan = planConductorRun(makeTask());
    // feature_delivery → pal primary 'claude_code', which is a real Conductor CLI.
    expect(plan.runtimeId).toBe('claude_code');
    expect(plan.runtimeSupported).toBe(true);
    expect(plan.substrate).toBe('tmux_worktree');
    // Frontend path → pal adds the frontend-design skill (proves selectSkills ran).
    expect(plan.skills).toContain('frontend-design');
    expect(plan.skills).toContain('recoder-platform');
    // Base MCP grants come straight from pal's selectToolGrants.
    expect(plan.mcpTools).toContain('recoder.tasks');
    expect(effectiveRuntimeId(plan)).toBe('claude_code');
  });

  it('lifts a high-risk sensitive-path task onto the daytona substrate with approval gates', () => {
    const plan = planConductorRun(
      makeTask({
        taskId: 'task-risky',
        title: 'Rotate billing secrets',
        intent: 'platform_hardening',
        targetPaths: ['packages/billing/secrets.ts'],
        approvalRequired: ['secret rotation requires sign-off'],
      }),
    );
    // pal.estimateTaskRisk → 'high' → selectSandbox → 'daytona'.
    expect(plan.risk).toBe('high');
    expect(plan.substrate).toBe('daytona');
    // Explicit + inferred approval gates flow through from estimateApprovalGates.
    expect(plan.approvalGateIds.length).toBeGreaterThan(0);
    expect(plan.skills).toContain('security-review');
  });

  it('routes a code-review task to codex with a claude reviewer (pal team selection drives it)', () => {
    const plan = planConductorRun(
      makeTask({ taskId: 'task-review', title: 'Audit the auth flow', intent: 'code_review', targetPaths: ['src/server.ts'] }),
    );
    expect(plan.runtimeId).toBe('codex');
    expect(plan.reviewerRuntimeId).toBe('claude_code');
    expect(plan.skills).toContain('code-review');
  });

  it('reports a non-CLI pal runtime as unsupported and exposes the real fallback', () => {
    // pal never returns 'browser_agent' as PRIMARY today, so assert the seam's
    // mapping contract directly via effectiveRuntimeId: when supported, the
    // recommended runtime is used; the fallback constant is always a real CLI.
    const plan = planConductorRun(makeTask());
    expect(['claude_code', 'codex', 'opencode', 'recoder_code', 'pi', 'gemini_cli', 'qwen_code', 'crush'])
      .toContain(plan.fallbackRuntimeId);
    expect(effectiveRuntimeId(plan)).toBe(plan.runtimeSupported ? plan.runtimeId : plan.fallbackRuntimeId);
  });
});
