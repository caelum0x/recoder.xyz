import type { VerificationPlan } from '@recoder/agent-os';
import type { RuntimeEvidenceArtifact } from '../types/evidence';
import type { ExecutionEnvironment } from '../env/execution-environment';
import { hashArtifactBody } from './artifact-hasher';

export type VerificationCommandResult = {
  command: string;
  exitCode: number | null;
  passed: boolean;
  artifact: RuntimeEvidenceArtifact;
};

export type VerificationRunResult = {
  /** True only when every command exited 0. Empty plans are `passed: true` (nothing to run). */
  passed: boolean;
  results: VerificationCommandResult[];
};

/**
 * Run a `TaskSpec.verification.commands` list in the run's environment and capture each
 * command's combined output as a verification artifact.
 *
 * Honors the project rule "never claim success without evidence": a non-zero exit yields
 * `passed: false`, and the overall result is `passed` only when ALL commands pass. Commands
 * are shelled via `bash -c` so a plan entry may be a full command line.
 */
export async function runVerification(input: {
  env: ExecutionEnvironment;
  plan: Pick<VerificationPlan, 'commands'>;
  cwd: string;
  env_?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<VerificationRunResult> {
  const commands = input.plan.commands ?? [];
  const results: VerificationCommandResult[] = [];

  for (const command of commands) {
    if (input.signal?.aborted) break;
    const exec = await input.env.exec({
      command: 'bash',
      args: ['-c', command],
      cwd: input.cwd,
      env: input.env_,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    const passed = exec.exitCode === 0;
    const body = composeOutput(exec.stdout, exec.stderr);
    results.push({
      command,
      exitCode: exec.exitCode,
      passed,
      artifact: {
        kind: 'verification',
        status: passed ? 'passed' : 'failed',
        title: `Verification: ${command}`,
        summary: passed
          ? `Command passed (exit 0).`
          : `Command failed (exit ${exec.exitCode ?? 'null'}).`,
        contentType: 'text/plain',
        ...hashArtifactBody(body),
        command,
        metadata: { output: body, exitCode: exec.exitCode },
      },
    });
  }

  const passed = results.every((r) => r.passed);
  return { passed, results };
}

function composeOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) return `${stdout}\n--- stderr ---\n${stderr}`;
  return stdout || stderr;
}
