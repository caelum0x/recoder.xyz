import type { RuntimeEvidenceKind, RuntimeEvidenceStatus } from '@recoder/agent-os';

/**
 * A runtime-local descriptor of an artifact captured during/after a run, before it is
 * handed to the agent-os artifact service via a seam. Maps onto `RuntimeEvidence` but
 * carries the raw content reference the collector still owns.
 */
export type RuntimeEvidenceArtifact = {
  kind: RuntimeEvidenceKind;
  status: RuntimeEvidenceStatus;
  title: string;
  summary?: string;
  /** Content type of the artifact body (e.g. text/x-diff, application/json, text/html). */
  contentType: string;
  /** sha256 of the content, filled by artifact-hasher. */
  sha256?: string;
  /** Byte length of the captured content. */
  byteLength?: number;
  command?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};
