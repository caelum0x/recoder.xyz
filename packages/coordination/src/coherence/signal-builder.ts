/**
 * signal-builder — WorkSignal factory for coherence findings.
 *
 * MERGED from `packages/agent-os/src/services/work-signal-service.ts`
 * (`createSignal` + `buildHandoffPrompt`): a WorkSignal always carries
 * `whyItMatters`, `recommendedNextAction`, and a fully-formed `agentHandoffPrompt`
 * so a human or agent can act on it without re-deriving context. The deterministic
 * `signalId`/`slug` scheme is preserved so a recurring drift coalesces onto a
 * stable id (the reconciler can then dedup against already-open signals).
 *
 * Pure: it takes values + a provided `signalId` (from IdGeneratorPort, supplied
 * by the impure shell) and returns a new WorkSignal. No IO, no clock.
 */

import type {
  WorkSignal,
  WorkSignalReason,
  WorkSignalSeverity,
  WorkSignalSource,
} from '../domain';

export type BuildSignalInput = {
  signalId: string;
  taskId: string;
  spaceId?: string;
  runId?: string;
  source: WorkSignalSource;
  sourceId: string;
  reason: WorkSignalReason;
  severity: WorkSignalSeverity;
  title: string;
  whyItMatters: string;
  recommendedNextAction: string;
  detectedAt: string;
  metadata?: Record<string, unknown>;
};

/**
 * Build an open WorkSignal. Mirrors `WorkSignalService.createSignal`: stamps the
 * handoff prompt, marks status `open`, and tags provenance in metadata.
 */
export function buildSignal(input: BuildSignalInput): WorkSignal {
  return {
    signalId: input.signalId,
    taskId: input.taskId,
    runId: input.runId,
    spaceId: input.spaceId,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title,
    severity: input.severity,
    status: 'open',
    detectedReason: input.reason,
    whyItMatters: input.whyItMatters,
    recommendedNextAction: input.recommendedNextAction,
    agentHandoffPrompt: buildHandoffPrompt(
      input.title,
      input.whyItMatters,
      input.recommendedNextAction,
    ),
    detectedAt: input.detectedAt,
    metadata: {
      generatedBy: 'coherence_reconciler',
      ...(input.metadata ?? {}),
    },
  };
}

/**
 * Deterministic, evidence-stable signal id. MERGED from
 * `WorkSignalService.createSignal`'s `signal_<reason>_<taskId>_<slug(sourceId)>`
 * scheme so the same drift on the same subject produces the same id across ticks.
 */
export function deterministicSignalId(
  reason: WorkSignalReason,
  taskId: string,
  sourceId: string,
): string {
  return `signal_${reason}_${taskId}_${slug(sourceId)}`;
}

/** MERGED verbatim from the agent-os WorkSignalService handoff-prompt builder. */
export function buildHandoffPrompt(
  title: string,
  whyItMatters: string,
  recommendedNextAction: string,
): string {
  return [
    'A Recoder work signal needs attention.',
    '',
    `Signal: ${title}`,
    `Why it matters: ${whyItMatters}`,
    `Recommended next action: ${recommendedNextAction}`,
    '',
    'Inspect the linked task/run/artifacts first. Do not claim completion until the signal condition is cleared or explicitly resolved by a human.',
  ].join('\n');
}

/** MERGED from the agent-os WorkSignalService `slug` helper. */
export function slug(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'unknown'
  );
}
