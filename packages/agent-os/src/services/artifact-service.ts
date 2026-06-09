import { createHash } from 'node:crypto';
import type { Artifact, ArtifactKind, InstructionBundle } from '../domain';

export type CreateArtifactInput = {
  artifactId?: string;
  runId?: string;
  taskId: string;
  kind: ArtifactKind;
  mimeType: string;
  path?: string;
  content?: string;
  contentHash?: string;
  public?: boolean;
  createdBy: string;
  provenance?: Artifact['provenance'];
  metadata?: Record<string, unknown>;
  now?: string;
};

export type CreatePullRequestArtifactInput = Omit<CreateArtifactInput, 'kind' | 'mimeType' | 'content' | 'path' | 'provenance'> & {
  url: string;
  number?: number | string;
  branch?: string;
  repository?: string;
  title?: string;
};

export type CreatePreviewArtifactInput = Omit<CreateArtifactInput, 'kind' | 'mimeType' | 'content' | 'path' | 'provenance'> & {
  url: string;
  provider?: string;
  environment?: string;
};

export type CreateVerificationArtifactInput = Omit<CreateArtifactInput, 'kind' | 'mimeType'> & {
  mimeType?: string;
  command?: string;
  passed?: boolean;
};

export type CreateInstructionBundleArtifactInput = Omit<CreateArtifactInput, 'kind' | 'mimeType' | 'content' | 'contentHash' | 'provenance'> & {
  bundle: InstructionBundle;
  auditBundle?: unknown;
};

export class ArtifactService {
  create(input: CreateArtifactInput): Artifact {
    return {
      artifactId: input.artifactId ?? `artifact_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      taskId: input.taskId,
      runId: input.runId,
      kind: input.kind,
      mimeType: input.mimeType,
      path: input.path,
      content: input.content,
      contentHash: input.contentHash ?? contentHash(input.content),
      public: input.public ?? false,
      createdBy: input.createdBy,
      provenance: input.provenance,
      metadata: input.metadata,
      createdAt: input.now ?? new Date().toISOString(),
    };
  }

  createPullRequest(input: CreatePullRequestArtifactInput): Artifact {
    return this.create({
      ...input,
      kind: 'pull_request',
      mimeType: 'application/json',
      content: JSON.stringify({
        url: input.url,
        number: input.number ?? null,
        branch: input.branch ?? null,
        repository: input.repository ?? null,
        title: input.title ?? null,
      }),
      provenance: {
        sourceTaskId: input.taskId,
        sourceRunId: input.runId,
        sourceUrl: input.url,
      },
      metadata: {
        ...(input.metadata || {}),
        url: input.url,
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.repository ? { repository: input.repository } : {}),
      },
    });
  }

  createPreview(input: CreatePreviewArtifactInput): Artifact {
    return this.create({
      ...input,
      kind: 'preview',
      mimeType: 'application/json',
      content: JSON.stringify({
        url: input.url,
        provider: input.provider ?? null,
        environment: input.environment ?? null,
      }),
      provenance: {
        sourceTaskId: input.taskId,
        sourceRunId: input.runId,
        sourceUrl: input.url,
      },
      metadata: {
        ...(input.metadata || {}),
        url: input.url,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.environment ? { environment: input.environment } : {}),
      },
    });
  }

  createVerification(input: CreateVerificationArtifactInput): Artifact {
    return this.create({
      ...input,
      kind: 'verification',
      mimeType: input.mimeType || 'text/plain',
      provenance: {
        ...(input.provenance || {}),
        sourceTaskId: input.taskId,
        sourceRunId: input.runId,
        sourceCommand: input.command || input.provenance?.sourceCommand,
      },
      metadata: {
        ...(input.metadata || {}),
        ...(input.command ? { command: input.command } : {}),
        ...(input.passed !== undefined ? { passed: input.passed } : {}),
      },
    });
  }

  createInstructionBundle(input: CreateInstructionBundleArtifactInput): Artifact {
    return this.create({
      ...input,
      artifactId: input.artifactId ?? `artifact_instruction_${input.bundle.bundleId}`,
      kind: 'instruction_bundle',
      mimeType: 'application/json',
      content: JSON.stringify({
        runtimeBundle: input.bundle,
        auditBundle: input.auditBundle ?? null,
      }, null, 2),
      provenance: {
        sourceTaskId: input.taskId,
        sourceRunId: input.runId,
      },
      metadata: {
        ...(input.metadata ?? {}),
        bundleId: input.bundle.bundleId,
        agentId: input.bundle.agentId,
        runtime: input.bundle.runtime,
        compilerVersion: input.bundle.compilerVersion,
        compiledAt: input.bundle.compiledAt,
        sourceCount: input.bundle.sourceRefs.length,
        memoryRefCount: input.bundle.memoryRefIds.length,
        approvalGateCount: input.bundle.approvalGateIds.length,
      },
    });
  }
}

function contentHash(content: string | undefined): string | undefined {
  return content === undefined ? undefined : `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
