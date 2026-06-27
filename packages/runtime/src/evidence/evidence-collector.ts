import type { RunEvent, VerificationPlan } from '@recoder/agent-os';
import type { RuntimeEvidenceArtifact } from '../types/evidence';
import type { ExecutionEnvironment } from '../env/execution-environment';
import { captureGitDiffArtifact } from './git-diff-artifact';
import { runVerification, type VerificationRunResult } from './verification-runner';
import { hashArtifactBody } from './artifact-hasher';

export type EvidenceCollectionInput = {
  env: ExecutionEnvironment;
  cwd: string;
  /** Verification plan from the TaskSpec, run only when the terminal state is success. */
  verification?: Pick<VerificationPlan, 'commands'>;
  /** The ordered RunEvents of the run, captured as a log artifact. */
  journal?: readonly RunEvent[];
  childEnv?: Readonly<Record<string, string>>;
  /** Whether the run reached a successful terminal state (gate for verification). */
  terminalOk: boolean;
  signal?: AbortSignal;
};

export type EvidenceCollectionResult = {
  artifacts: RuntimeEvidenceArtifact[];
  verification?: VerificationRunResult;
  /** True when terminalOk AND (no verification plan OR verification passed). */
  verified: boolean;
};

/**
 * Orchestrate evidence capture at terminal state: working-tree diff, run-log artifact, and
 * verification commands (only when the run itself succeeded). The collector NEVER fabricates
 * success — `verified` is true only when the run succeeded and every verification command
 * passed (or there were none).
 */
export async function collectEvidence(
  input: EvidenceCollectionInput,
): Promise<EvidenceCollectionResult> {
  const artifacts: RuntimeEvidenceArtifact[] = [];

  const diff = await captureGitDiffArtifact({
    env: input.env,
    cwd: input.cwd,
    signal: input.signal,
  }).catch(() => null);
  if (diff) artifacts.push(diff);

  if (input.journal && input.journal.length > 0) {
    artifacts.push(buildLogArtifact(input.journal));
  }

  let verification: VerificationRunResult | undefined;
  if (input.terminalOk && input.verification && input.verification.commands.length > 0) {
    verification = await runVerification({
      env: input.env,
      plan: input.verification,
      cwd: input.cwd,
      env_: input.childEnv,
      signal: input.signal,
    });
    for (const result of verification.results) {
      artifacts.push(result.artifact);
    }
  }

  const verified = input.terminalOk && (verification?.passed ?? true);
  return { artifacts, verification, verified };
}

function buildLogArtifact(journal: readonly RunEvent[]): RuntimeEvidenceArtifact {
  const body = journal.map((event) => JSON.stringify(event)).join('\n');
  return {
    kind: 'stdout',
    status: 'observed',
    title: 'Run event log',
    summary: `${journal.length} RunEvent(s) captured.`,
    contentType: 'application/x-ndjson',
    ...hashArtifactBody(body),
    metadata: { eventCount: journal.length },
  };
}
