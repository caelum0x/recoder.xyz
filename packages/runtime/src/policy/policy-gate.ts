import type { RuntimeTaskInput } from '@recoder/agent-runtimes';
import { assertSignedEnvelope, type EnvelopeVerifierFn, type SignedEnvelope } from './envelope-verifier';
import { WorkLockGuard, type WorkLockCoverage } from './work-lock-guard';
import { ForbiddenPathGuard } from './forbidden-path-guard';
import { TargetPathGuard } from './target-path-guard';
import { ShellGuard } from './shell-guard';

/**
 * The pre-run gate. It refuses to start a run when a required gate is unmet:
 * a missing/invalid signed envelope when required. Work-lock + path + shell guards are
 * constructed here for use during the run, but the gate's job is the up-front REFUSAL.
 *
 * It never invents allow/deny — it enforces what was decided upstream.
 */
export type PolicyGateInput = {
  input: RuntimeTaskInput;
  envelope?: SignedEnvelope;
  verifyEnvelope?: EnvelopeVerifierFn;
  workLockCoverage?: WorkLockCoverage;
};

export type RunGuards = {
  forbiddenPath: ForbiddenPathGuard;
  targetPath: TargetPathGuard;
  workLock: WorkLockGuard;
  shell: ShellGuard;
};

/**
 * Run the up-front gate. Throws `policy_denied`/`approval_required` on refusal.
 * Returns the per-run guards the engine applies to write-bearing frames.
 */
export async function runPolicyGate(gate: PolicyGateInput): Promise<RunGuards> {
  const { input } = gate;

  await assertSignedEnvelope({
    policy: input.policy,
    envelope: gate.envelope,
    verify: gate.verifyEnvelope,
  });

  const coverage: WorkLockCoverage = gate.workLockCoverage ?? {
    enforce: input.policy.enforceWorkLocks,
    lockedGlobs: input.task.targetPaths ?? [],
  };

  return {
    forbiddenPath: ForbiddenPathGuard.fromTask(input.task),
    targetPath: TargetPathGuard.fromTask(input.task),
    workLock: new WorkLockGuard(coverage),
    shell: ShellGuard.fromPolicy(input.policy),
  };
}
