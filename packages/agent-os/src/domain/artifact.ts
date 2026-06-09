export type ArtifactKind =
  | 'summary'
  | 'changed_files'
  | 'test_output'
  | 'preview'
  | 'pull_request'
  | 'screenshot'
  | 'verification'
  | 'instruction_bundle'
  | 'memory_candidate'
  | 'log'
  | 'custom';

export const ArtifactKindEnum = {
  Summary: 'summary' as const satisfies ArtifactKind,
  ChangedFiles: 'changed_files' as const satisfies ArtifactKind,
  TestOutput: 'test_output' as const satisfies ArtifactKind,
  Preview: 'preview' as const satisfies ArtifactKind,
  PullRequest: 'pull_request' as const satisfies ArtifactKind,
  Screenshot: 'screenshot' as const satisfies ArtifactKind,
  Verification: 'verification' as const satisfies ArtifactKind,
  InstructionBundle: 'instruction_bundle' as const satisfies ArtifactKind,
  MemoryCandidate: 'memory_candidate' as const satisfies ArtifactKind,
  Log: 'log' as const satisfies ArtifactKind,
  Custom: 'custom' as const satisfies ArtifactKind,
} as const;

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  ArtifactKindEnum.Summary,
  ArtifactKindEnum.ChangedFiles,
  ArtifactKindEnum.TestOutput,
  ArtifactKindEnum.Preview,
  ArtifactKindEnum.PullRequest,
  ArtifactKindEnum.Screenshot,
  ArtifactKindEnum.Verification,
  ArtifactKindEnum.InstructionBundle,
  ArtifactKindEnum.MemoryCandidate,
  ArtifactKindEnum.Log,
  ArtifactKindEnum.Custom,
] as const;

export type Artifact = {
  artifactId: string;
  taskId: string;
  runId?: string;
  kind: ArtifactKind;
  mimeType: string;
  path?: string;
  contentHash?: string;
  content?: string;
  public: boolean;
  createdAt: string;
  createdBy: string;
  provenance?: {
    sourceTaskId?: string;
    sourceRunId?: string;
    sourceCommand?: string;
    sourceUrl?: string;
  };
  metadata?: Record<string, unknown>;
};
