import { MemoryReviewWorkflow, type MemoryStore } from '@recoder/agent-memory';
import type { MemoryCandidate } from '@recoder/agent-os';
import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

export const memoryMcpServer: McpServerRegistration = {
  serverId: 'recoder.memory',
  kind: 'memory',
  displayName: 'Recoder Memory',
  transport: 'http',
  enabled: true,
  toolNames: ['memory.search', 'memory.candidate.create', 'memory.review'],
};

export function registerMemoryMcpTools(
  router: McpToolRouter,
  store: MemoryStore,
  workflow = new MemoryReviewWorkflow(store),
): void {
  router.register(memoryMcpServer, 'memory.search', async (input) => ({
    content: await store.search(readRequiredString(input.args.query, 'query'), {
      scope: readString(input.args.scope),
      limit: readNumber(input.args.limit),
    }),
  }));

  router.register(memoryMcpServer, 'memory.candidate.create', async (input) => {
    const taskId = readString(input.args.taskId) ?? readEvidenceTaskId(input.args.evidence) ?? input.task?.taskId;
    const artifactId = readString(input.args.artifactId) ?? readEvidenceArtifactId(input.args.evidence);
    if (!taskId || !artifactId) {
      throw new Error('memory candidates require taskId and artifactId evidence');
    }

    const candidate = await workflow.propose({
      candidateId: readString(input.args.candidateId) ?? `memcand_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      scope: readMemoryScope(input.args.scope),
      title: readRequiredString(input.args.title, 'title'),
      body: readRequiredString(input.args.body, 'body'),
      evidence: { taskId, artifactId },
      proposedBy: readString(input.args.proposedBy) ?? input.actor.agentId,
      proposedAt: readString(input.args.proposedAt),
      expiresAt: readNullableString(input.args.expiresAt),
    });

    return { content: candidate };
  });

  router.register(memoryMcpServer, 'memory.review', async (input) => {
    const candidate = await resolveCandidate(store, input.args);
    const accepted = readBoolean(input.args.accepted);
    if (accepted === undefined) {
      throw new Error('accepted boolean is required');
    }

    return {
      content: await workflow.review({
        candidate,
        accepted,
        reviewedBy: readString(input.args.reviewedBy) ?? input.actor.agentId,
        reviewedAt: readString(input.args.reviewedAt),
        reason: readString(input.args.reason),
        memoryId: readString(input.args.memoryId),
        supersedesMemoryId: readString(input.args.supersedesMemoryId),
      }),
    };
  });
}

async function resolveCandidate(store: MemoryStore, args: Record<string, unknown>): Promise<MemoryCandidate> {
  if (isMemoryCandidate(args.candidate)) {
    return args.candidate;
  }

  const candidateId = readRequiredString(args.candidateId, 'candidateId');
  const candidates = await store.listCandidates(readString(args.scope));
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`memory candidate not found: ${candidateId}`);
  }
  return candidate;
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readMemoryScope(value: unknown): MemoryCandidate['scope'] {
  const scope = readString(value);
  if (
    scope === 'user'
    || scope === 'org'
    || scope === 'space'
    || scope === 'repo'
    || scope === 'path'
    || scope === 'agent'
    || scope === 'task-type'
  ) {
    return scope;
  }
  return 'repo';
}

function readEvidenceArtifactId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readString(value.artifactId) ?? readString(value.artifact_id);
}

function readEvidenceTaskId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return readString(value.taskId) ?? readString(value.task_id);
}

function isMemoryCandidate(value: unknown): value is MemoryCandidate {
  return isRecord(value)
    && typeof value.candidateId === 'string'
    && readMemoryScope(value.scope) === value.scope
    && typeof value.title === 'string'
    && typeof value.body === 'string'
    && value.status === 'candidate_created'
    && typeof value.proposedBy === 'string'
    && typeof value.proposedAt === 'string'
    && isRecord(value.evidence)
    && typeof value.evidence.taskId === 'string'
    && typeof value.evidence.artifactId === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
