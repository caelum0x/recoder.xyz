import type { RuntimeEvidence, RuntimeEvidenceKind, RuntimeEvidenceStatus } from '../domain';

export type CreateRuntimeEvidenceInput = {
  evidenceId?: string;
  taskId: string;
  runId?: string;
  kind: RuntimeEvidenceKind;
  status?: RuntimeEvidenceStatus;
  title?: string;
  summary?: string;
  source?: RuntimeEvidence['source'];
  artifactIds?: string[];
  observedAt?: string;
  metadata?: Record<string, unknown>;
};

export class RuntimeEvidenceService {
  create(input: CreateRuntimeEvidenceInput): RuntimeEvidence {
    const observedAt = input.observedAt ?? new Date().toISOString();
    return {
      evidenceId: input.evidenceId ?? `evidence_${observedAt.replace(/[^0-9]/g, '')}_${Math.random().toString(16).slice(2)}`,
      taskId: input.taskId,
      runId: input.runId,
      kind: input.kind,
      status: input.status ?? 'observed',
      title: input.title ?? defaultRuntimeEvidenceTitle(input.kind),
      summary: input.summary,
      source: input.source ?? {},
      artifactIds: input.artifactIds ?? [],
      observedAt,
      metadata: input.metadata,
    };
  }
}

function defaultRuntimeEvidenceTitle(kind: RuntimeEvidenceKind): string {
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
