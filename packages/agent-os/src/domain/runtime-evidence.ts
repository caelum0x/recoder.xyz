export type RuntimeEvidenceKind =
  | 'git_status'
  | 'clone_provenance'
  | 'stdout'
  | 'stderr'
  | 'file_mutation'
  | 'preview_link'
  | 'browser_check'
  | 'verification'
  | 'desktop'
  | 'custom';

export const RuntimeEvidenceKindEnum = {
  GitStatus: 'git_status' as const satisfies RuntimeEvidenceKind,
  CloneProvenance: 'clone_provenance' as const satisfies RuntimeEvidenceKind,
  Stdout: 'stdout' as const satisfies RuntimeEvidenceKind,
  Stderr: 'stderr' as const satisfies RuntimeEvidenceKind,
  FileMutation: 'file_mutation' as const satisfies RuntimeEvidenceKind,
  PreviewLink: 'preview_link' as const satisfies RuntimeEvidenceKind,
  BrowserCheck: 'browser_check' as const satisfies RuntimeEvidenceKind,
  Verification: 'verification' as const satisfies RuntimeEvidenceKind,
  Desktop: 'desktop' as const satisfies RuntimeEvidenceKind,
  Custom: 'custom' as const satisfies RuntimeEvidenceKind,
} as const;

export type RuntimeEvidenceStatus = 'observed' | 'passed' | 'failed' | 'warning';

export type RuntimeEvidence = {
  evidenceId: string;
  taskId: string;
  runId?: string;
  kind: RuntimeEvidenceKind;
  status: RuntimeEvidenceStatus;
  title: string;
  summary?: string;
  source: {
    runtimeId?: string;
    adapterId?: string;
    sandboxId?: string;
    sessionId?: string;
    command?: string;
    url?: string;
  };
  artifactIds: string[];
  observedAt: string;
  metadata?: Record<string, unknown>;
};
