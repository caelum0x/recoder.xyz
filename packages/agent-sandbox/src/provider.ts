import type { Artifact, TaskSpec } from '@recoder/agent-os';

export type SandboxProviderId = 'daytona' | 'e2b' | 'local_container' | 'custom';

export type SandboxSession = {
  sessionId: string;
  provider: SandboxProviderId;
  taskId: string;
  status: 'creating' | 'ready' | 'running' | 'stopped' | 'failed';
  workspaceUrl?: string;
  previewUrl?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SandboxCreateInput = {
  task: TaskSpec;
  repo?: string;
  branch?: string;
  environment?: Record<string, string>;
};

export type SandboxCommandInput = {
  sessionId: string;
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
};

export type SandboxCommandResult = {
  sessionId: string;
  command: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  timedOut?: boolean;
};

export type SandboxSnapshotInput = {
  sessionId: string;
  label: string;
  paths?: string[];
  metadata?: Record<string, unknown>;
};

export type SandboxSnapshotRef = {
  snapshotId: string;
  sessionId: string;
  label: string;
  createdAt: string;
  artifactUrl?: string;
  metadata?: Record<string, unknown>;
};

export type SandboxEvidenceKind =
  | 'stdout'
  | 'stderr'
  | 'git_status'
  | 'file_mutation'
  | 'preview_url'
  | 'snapshot'
  | 'custom';

export type SandboxEvidence = {
  evidenceId: string;
  taskId: string;
  runId?: string;
  sessionId: string;
  provider: SandboxProviderId;
  kind: SandboxEvidenceKind;
  summary: string;
  content?: string;
  url?: string;
  command?: string;
  path?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export interface SandboxProvider {
  readonly id: SandboxProviderId;
  health(): Promise<{ status: 'healthy' | 'degraded' | 'offline' | 'unknown'; message?: string }>;
  create(input: SandboxCreateInput): Promise<SandboxSession>;
  runCommand?(input: SandboxCommandInput): Promise<SandboxCommandResult>;
  snapshot?(input: SandboxSnapshotInput): Promise<SandboxSnapshotRef>;
  evidence?(session: SandboxSession): Promise<SandboxEvidence[]>;
  stop(sessionId: string): Promise<void>;
}

export function createDetachedSandboxSession(input: {
  provider: SandboxProviderId;
  taskId: string;
  sessionId?: string;
  status?: SandboxSession['status'];
  workspaceUrl?: string;
  previewUrl?: string;
}): SandboxSession {
  return {
    sessionId: input.sessionId ?? `${input.provider}-${input.taskId}`,
    provider: input.provider,
    taskId: input.taskId,
    status: input.status ?? 'creating',
    workspaceUrl: input.workspaceUrl,
    previewUrl: input.previewUrl,
    createdAt: new Date().toISOString(),
  };
}

export function createSandboxEvidenceArtifact(input: {
  evidence: SandboxEvidence;
  artifactId?: string;
  createdBy?: string;
}): Artifact {
  return {
    artifactId: input.artifactId ?? `artifact_${input.evidence.evidenceId}`,
    taskId: input.evidence.taskId,
    runId: input.evidence.runId,
    kind: artifactKindForEvidence(input.evidence.kind),
    mimeType: input.evidence.url ? 'text/uri-list' : 'text/plain',
    path: input.evidence.path,
    content: input.evidence.content ?? input.evidence.url ?? input.evidence.summary,
    public: false,
    createdAt: input.evidence.createdAt,
    createdBy: input.createdBy ?? input.evidence.provider,
    provenance: {
      sourceTaskId: input.evidence.taskId,
      sourceRunId: input.evidence.runId,
      sourceCommand: input.evidence.command,
      sourceUrl: input.evidence.url,
    },
    metadata: {
      ...(input.evidence.metadata ?? {}),
      evidenceId: input.evidence.evidenceId,
      sessionId: input.evidence.sessionId,
      provider: input.evidence.provider,
      evidenceKind: input.evidence.kind,
      summary: input.evidence.summary,
    },
  };
}

function artifactKindForEvidence(kind: SandboxEvidenceKind): Artifact['kind'] {
  if (kind === 'preview_url') {
    return 'preview';
  }
  if (kind === 'stdout' || kind === 'stderr') {
    return 'log';
  }
  if (kind === 'snapshot') {
    return 'custom';
  }
  return 'verification';
}
