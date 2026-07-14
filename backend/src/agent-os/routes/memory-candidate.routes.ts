import { Router, type Request, type Response } from 'express';
import type { MemoryCandidate, MemoryItem } from '@recoder/agent-os';
import {
  createMemoryCandidate,
  MemoryReviewWorkflow,
  type MemoryStore,
} from '@recoder/agent-memory';
import type { AgentOsRepository } from '../repositories/agent-os.repository';
import { agentOsContainer } from '../service-container';

/**
 * Live @recoder/agent-memory reviewed-candidate lifecycle on the canonical Agent OS
 * control plane.
 *
 * Per Agent OS policy, durable memory is never written directly. Agents propose
 * memory *candidates* with evidence; the candidate is materialized into a durable
 * MemoryItem only on an explicit accepted review. This module exercises the real
 * @recoder/agent-memory helpers (`createMemoryCandidate` + `MemoryReviewWorkflow`)
 * rather than re-implementing the lifecycle, and bridges them to the Agent OS
 * repository via a thin MemoryStore adapter.
 *
 * These routes are additive: they live under `/memory/candidates` alongside the
 * existing memory CRUD surface and do not remove or alter it.
 */

/**
 * Adapts the Agent OS repository to the @recoder/agent-memory MemoryStore port so
 * the package's lifecycle helpers persist through the same store of record.
 */
class RepositoryMemoryStore implements MemoryStore {
  constructor(private readonly repository: AgentOsRepository) {}

  async createCandidate(candidate: MemoryCandidate): Promise<MemoryCandidate> {
    return this.repository.upsertMemoryCandidate(candidate);
  }

  async listCandidates(scope?: string): Promise<MemoryCandidate[]> {
    const all = await this.repository.listMemoryCandidates();
    return scope ? all.filter((candidate) => candidate.scope === scope) : all;
  }

  async upsertMemory(item: MemoryItem): Promise<MemoryItem> {
    return this.repository.upsertMemoryItem(item);
  }

  async search(query: string, options?: { scope?: string; limit?: number }): Promise<MemoryItem[]> {
    const items = await this.repository.listMemoryItems();
    const scoped = options?.scope ? items.filter((item) => item.scope === options.scope) : items;
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? scoped.filter(
          (item) =>
            item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle),
        )
      : scoped;
    return typeof options?.limit === 'number' ? matched.slice(0, options.limit) : matched;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

const MEMORY_SCOPES = ['user', 'org', 'space', 'repo', 'path', 'agent', 'task-type'] as const;
type MemoryScope = (typeof MEMORY_SCOPES)[number];

function parseScope(value: unknown): MemoryScope {
  if (typeof value === 'string' && (MEMORY_SCOPES as readonly string[]).includes(value)) {
    return value as MemoryScope;
  }
  throw new Error(`scope must be one of: ${MEMORY_SCOPES.join(', ')}`);
}

/**
 * Validate + normalize evidence. Memory candidates MUST carry evidence
 * (taskId + artifactId); the review workflow re-checks this, but failing fast at
 * the boundary gives a clearer error than a deep workflow rejection.
 */
function parseEvidence(value: unknown): MemoryCandidate['evidence'] {
  if (!isRecord(value)) {
    throw new Error('evidence is required (taskId + artifactId)');
  }
  return {
    taskId: requireString(value.taskId, 'evidence.taskId'),
    artifactId: requireString(value.artifactId, 'evidence.artifactId'),
  };
}

export function createMemoryCandidateRouter(
  repository: AgentOsRepository = agentOsContainer.repository,
): Router {
  const router = Router();
  const store = new RepositoryMemoryStore(repository);
  const workflow = new MemoryReviewWorkflow(store);

  // GET /api/agent-os/memory/candidates — list reviewed-candidate backlog.
  router.get('/candidates', async (req: Request, res: Response) => {
    try {
      const scope = optionalString(req.query?.scope as unknown);
      const candidates = await store.listCandidates(scope);
      res.json({ success: true, data: candidates });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_candidates_list_failed',
      });
    }
  });

  // POST /api/agent-os/memory/candidates — propose a candidate WITH evidence.
  // Uses the real @recoder/agent-memory createMemoryCandidate + workflow.propose.
  router.post('/candidates', async (req: Request, res: Response) => {
    try {
      const body = isRecord(req.body) ? req.body : {};
      const candidate = createMemoryCandidate({
        candidateId: optionalString(body.candidateId) ?? `mc_${Date.now().toString(36)}`,
        scope: parseScope(body.scope),
        title: requireString(body.title, 'title'),
        body: requireString(body.body, 'body'),
        evidence: parseEvidence(body.evidence),
        proposedBy: requireString(body.proposedBy, 'proposedBy'),
        proposedAt: optionalString(body.proposedAt),
        expiresAt:
          body.expiresAt === null ? null : optionalString(body.expiresAt),
      });

      const persisted = await workflow.propose({
        candidateId: candidate.candidateId,
        scope: candidate.scope,
        title: candidate.title,
        body: candidate.body,
        evidence: candidate.evidence,
        proposedBy: candidate.proposedBy,
        proposedAt: candidate.proposedAt,
        expiresAt: candidate.expiresAt,
      });

      res.status(201).json({ success: true, data: persisted });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_candidate_propose_failed',
      });
    }
  });

  // POST /api/agent-os/memory/candidates/:candidateId/review — accept/reject.
  // On accept, the workflow materializes a durable MemoryItem (never written directly).
  router.post('/candidates/:candidateId/review', async (req: Request, res: Response) => {
    try {
      const candidateId = req.params.candidateId;
      const candidate = (await store.listCandidates()).find((c) => c.candidateId === candidateId);
      if (!candidate) {
        res
          .status(404)
          .json({ success: false, error: `memory candidate not found: ${candidateId}` });
        return;
      }

      const body = isRecord(req.body) ? req.body : {};
      const accepted = body.accepted === true;
      const result = await workflow.review({
        candidate,
        accepted,
        reviewedBy: requireString(body.reviewedBy, 'reviewedBy'),
        reviewedAt: optionalString(body.reviewedAt),
        reason: optionalString(body.reason),
        memoryId: optionalString(body.memoryId),
        supersedesMemoryId: optionalString(body.supersedesMemoryId),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'memory_candidate_review_failed',
      });
    }
  });

  return router;
}
