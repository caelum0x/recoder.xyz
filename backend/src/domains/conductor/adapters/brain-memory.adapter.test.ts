/**
 * brain-memory.adapter — proves the conductor↔memory seam law.
 *
 * Contract under test:
 *  - enrichPrompt folds recalled memories (+ optional repo passages) into the
 *    prompt with TRUTHFUL provenance, and hands back the RAW prompt untouched
 *    when nothing is recalled / no userId is known.
 *  - a faulted recall/retrieval engine NEVER throws across the boundary — the
 *    launch degrades to the identity result.
 *  - harvestOnCompletion delegates to the harvest service and degrades to a
 *    truthful `{ harvested: false }` (never rethrows into the terminal path).
 */
import { describe, it, expect, vi } from 'vitest';
import { createBrainMemoryAdapter } from './brain-memory.adapter.js';
import type { RecallService } from '../../memory/recall/recall-fusion.js';
import type { RetrievalPort } from '../../memory/ports/retrieval.port.js';
import type { HarvestService } from '../../memory/lifecycle/harvest.js';
import type { FusionResult } from '../../memory/types.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createBrainMemoryAdapter>[0]['logger'];

const fusion = (memories: FusionResult['memories']): FusionResult => ({
  memories,
  sources: [],
  reranker: 'identity',
});

const recallOf = (result: FusionResult): RecallService => ({
  recall: vi.fn().mockResolvedValue(result),
});

const harvestStub = (result: Awaited<ReturnType<HarvestService['harvest']>>): HarvestService => ({
  harvest: vi.fn().mockResolvedValue(result),
});

describe('brain-memory adapter — enrichPrompt', () => {
  it('folds recalled memories into the prompt with truthful provenance', async () => {
    const recall = recallOf(
      fusion([
        {
          id: 'm1',
          title: 'DB URL rule',
          body: 'never localhost in prod',
          provenance: { source: 'items', ref: 'mem_1', score: 0.9 },
        },
      ]),
    );
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'fix the config', userId: 'u1', taskId: 't1' });

    expect(out.prompt).toContain('## Recalled context');
    expect(out.prompt).toContain('[items] DB URL rule: never localhost in prod');
    expect(out.prompt).toContain('fix the config');
    expect(out.sources).toEqual([{ source: 'items', ref: 'mem_1' }]);
  });

  it('propagates a degraded rerank into the enrichment provenance (truthful marker, never silent)', async () => {
    const recall = recallOf({
      memories: [
        {
          id: 'm1',
          body: 'the box has 16gb',
          provenance: { source: 'beads', ref: 'bd-9', score: 0.4 },
        },
      ],
      sources: [],
      reranker: 'lexical',
      rerankerReason: 'colbert reranker unavailable (torch/sidecar absent)',
    });
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'how much ram', userId: 'u1' });

    expect(out.sources).toContainEqual({
      source: 'recall-rerank',
      ref: 'degraded:lexical: colbert reranker unavailable (torch/sidecar absent)',
    });
    // The memory's own provenance is still first-class alongside the marker.
    expect(out.sources).toContainEqual({ source: 'beads', ref: 'bd-9' });
  });

  it('adds NO degrade marker when ColBERT actually ranked the recall', async () => {
    const recall = recallOf({
      memories: [
        {
          id: 'm1',
          body: 'the box has 16gb',
          provenance: { source: 'mem0', ref: 'mem-1', score: 0.8 },
        },
      ],
      sources: [],
      reranker: 'colbert',
    });
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'how much ram', userId: 'u1' });

    expect(out.sources).toEqual([{ source: 'mem0', ref: 'mem-1' }]);
  });

  it('returns the raw prompt unchanged when recall is empty (never fabricates)', async () => {
    const recall = recallOf(fusion([]));
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'do the thing', userId: 'u1' });

    expect(out.prompt).toBe('do the thing');
    expect(out.sources).toEqual([]);
  });

  it('skips recall entirely without a userId (no cross-tenant guess)', async () => {
    const recall = recallOf(fusion([]));
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'anon prompt' });

    expect(out.prompt).toBe('anon prompt');
    expect(recall.recall).not.toHaveBeenCalled();
  });

  it('degrades to the identity result when recall throws (never crosses the boundary)', async () => {
    const recall: RecallService = { recall: vi.fn().mockRejectedValue(new Error('mem0 down')) };
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'resilient prompt', userId: 'u1' });

    expect(out.prompt).toBe('resilient prompt');
    expect(out.sources).toEqual([]);
  });

  it('folds repo passages when retrieval is configured', async () => {
    const recall = recallOf(fusion([]));
    const retrieval: RetrievalPort = {
      configured: () => true,
      ingest: vi.fn(),
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        query: 'q',
        reranker: 'identity',
        passages: [{ id: 'p1', text: 'server boots on :3001', score: 0.5, docId: 'doc9', source: 'server.ts' }],
      }),
    };
    const brain = createBrainMemoryAdapter({
      recall,
      retrieval,
      harvest: harvestStub({ harvested: false, reason: 'x' }),
      logger,
    });

    const out = await brain.enrichPrompt({ prompt: 'where does it boot', userId: 'u1', repoPath: '/repo' });

    expect(out.prompt).toContain('## Repository context');
    expect(out.prompt).toContain('server.ts: server boots on :3001');
    expect(out.sources).toEqual([{ source: 'retrieval', ref: 'doc9' }]);
  });

  it('targets the per-repo ColBERT collection when repoCollection is set (closes the dead write)', async () => {
    const search = vi.fn().mockResolvedValue({
      status: 'ok',
      query: 'q',
      reranker: 'identity',
      passages: [{ id: 'p1', text: 'boots on :3001', score: 0.5, docId: 'doc9', source: 'server.ts' }],
    });
    const retrieval: RetrievalPort = { configured: () => true, ingest: vi.fn(), search };
    const brain = createBrainMemoryAdapter({
      recall: recallOf(fusion([])),
      retrieval,
      harvest: harvestStub({ harvested: false, reason: 'x' }),
      logger,
    });

    await brain.enrichPrompt({
      prompt: 'where does it boot',
      userId: 'u1',
      repoPath: '/repo',
      repoCollection: 'repo_project_1',
    });

    // The colbert first-stage search is pointed at the per-repo PLAID index; the
    // Qdrant `collection` opt is left untouched (decoupled by SearchOpts).
    expect(search).toHaveBeenCalledWith('where does it boot', {
      topK: 4,
      colbertCollection: 'repo_project_1',
    });
  });

  it('omits colbertCollection when no repoCollection is resolved (CLI path falls back to default)', async () => {
    const search = vi.fn().mockResolvedValue({
      status: 'ok',
      query: 'q',
      reranker: 'identity',
      passages: [],
    });
    const retrieval: RetrievalPort = { configured: () => true, ingest: vi.fn(), search };
    const brain = createBrainMemoryAdapter({
      recall: recallOf(fusion([])),
      retrieval,
      harvest: harvestStub({ harvested: false, reason: 'x' }),
      logger,
    });

    await brain.enrichPrompt({ prompt: 'boot?', userId: 'u1', repoPath: '/repo' });

    // No `colbertCollection` key at all — retrieval uses its default collection.
    expect(search).toHaveBeenCalledWith('boot?', { topK: 4 });
  });

  it('threads the run repo into recall as repoRef (drives cross-RUN scope-boost)', async () => {
    const recall = recallOf(fusion([]));
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    await brain.enrichPrompt({ prompt: 'fix it', userId: 'u1', repoPath: '/srv/recoder.xyz' });

    expect(recall.recall).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', repoRef: '/srv/recoder.xyz' }),
    );
  });

  it('surfaces WHY a memory ranked (scope-boost signals) in the rendered recall bullet', async () => {
    const recall = recallOf(
      fusion([
        {
          id: 'm1',
          title: 'auth verify',
          body: 'delegate session verify over HTTP',
          provenance: { source: 'candidates', ref: 'c9', score: 0.9, signals: ['repo-match', 'lexical'] },
        },
      ]),
    );
    const brain = createBrainMemoryAdapter({ recall, harvest: harvestStub({ harvested: false, reason: 'x' }), logger });

    const out = await brain.enrichPrompt({ prompt: 'auth verify', userId: 'u1', repoPath: '/srv/recoder.xyz' });

    // The bullet states the source AND why it surfaced (auditable, never silent).
    expect(out.prompt).toContain('[candidates · why: repo-match, lexical] auth verify: delegate session verify over HTTP');
    // The provenance ref stays first-class (unchanged shape for the audit trail).
    expect(out.sources).toContainEqual({ source: 'candidates', ref: 'c9' });
  });
});

describe('brain-memory adapter — harvestOnCompletion', () => {
  it('delegates to the harvest service with evidence + defaults', async () => {
    const harvest = harvestStub({ harvested: true, candidate: { candidateId: 'c1' } as never });
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    const res = await brain.harvestOnCompletion({
      userId: 'u1',
      taskId: 't1',
      artifactId: 'a1',
      runId: 'r1',
      outcome: 'completed',
    });

    expect(res.harvested).toBe(true);
    expect(harvest.harvest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', taskId: 't1', artifactId: 'a1', scope: 'task-type', proposedBy: 'conductor' }),
    );
  });

  it('skips truthfully with no userId (never files a tenant-less wisp)', async () => {
    const harvest = harvestStub({ harvested: true, candidate: {} as never });
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    const res = await brain.harvestOnCompletion({ userId: '', taskId: 't1', artifactId: 'a1', outcome: 'failed' });

    expect(res).toEqual({ harvested: false, reason: 'harvest skipped: no userId on the run' });
    expect(harvest.harvest).not.toHaveBeenCalled();
  });

  it('degrades to a truthful skip when harvest throws (terminal path never sees it)', async () => {
    const harvest: HarvestService = { harvest: vi.fn().mockRejectedValue(new Error('store down')) };
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    const res = await brain.harvestOnCompletion({ userId: 'u1', taskId: 't1', artifactId: 'a1', outcome: 'completed' });

    expect(res.harvested).toBe(false);
  });

  it('shapes a REUSABLE structured lesson from convergence provenance (thesis §7)', async () => {
    const harvest = harvestStub({ harvested: true, candidate: { candidateId: 'c1' } as never });
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    await brain.harvestOnCompletion({
      userId: 'u1',
      taskId: 't1',
      artifactId: 'a1',
      outcome: 'completed',
      repo: '/srv/recoder.xyz',
      taskTitle: 'fix auth',
      convergedAgents: 2,
      winningApproach: 'delegated verify',
      contestedPaths: ['packages/auth/src/session.ts'],
      verified: true,
    });

    const call = (harvest.harvest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.body).toBe(
      "On recoder.xyz, task 'fix auth': converged 2 agents; kept delegated verify; " +
        'contested packages/auth/src/session.ts; verified pass; outcome=completed. ' +
        'Evidence: task t1, artifact a1.',
    );
    // The shaped body embeds the repo basename so a LATER run repo-matches it.
    expect(call.body).toContain('On recoder.xyz,');
    // Evidence anchor is always present (the candidate stays evidence-backed).
    expect(call.evidence ?? { taskId: call.taskId, artifactId: call.artifactId }).toMatchObject({
      taskId: 't1',
      artifactId: 'a1',
    });
  });

  it('keeps a shaped harvest a CANDIDATE — never auto-promotes to durable memory', async () => {
    // The adapter only ever calls harvest.harvest (propose a wisp). There is NO
    // promote/accept seam on it, so a harvested lesson stays ephemeral until the
    // human/policy accept path runs (AGENTS.md). Assert the returned artifact is a
    // candidate, and that harvest — not any durable write — is what was invoked.
    const harvest = harvestStub({
      harvested: true,
      candidate: { candidateId: 'c1', status: 'candidate_created' } as never,
    });
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    const res = await brain.harvestOnCompletion({
      userId: 'u1',
      taskId: 't1',
      artifactId: 'a1',
      outcome: 'completed',
      convergedAgents: 3,
    });

    expect(res.harvested).toBe(true);
    if (res.harvested) {
      expect((res.candidate as unknown as { status: string }).status).toBe('candidate_created');
    }
    expect(harvest.harvest).toHaveBeenCalledTimes(1);
    // No promote surface exists on the brain adapter (compile-time + runtime).
    expect((brain as unknown as Record<string, unknown>).promote).toBeUndefined();
    expect((brain as unknown as Record<string, unknown>).accept).toBeUndefined();
  });

  it('falls back to the plain default body when there is NO convergence provenance', async () => {
    const harvest = harvestStub({ harvested: true, candidate: { candidateId: 'c1' } as never });
    const brain = createBrainMemoryAdapter({ recall: recallOf(fusion([])), harvest, logger });

    await brain.harvestOnCompletion({ userId: 'u1', taskId: 't1', artifactId: 'a1', runId: 'r1', outcome: 'completed' });

    const call = (harvest.harvest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // No "converged"/"kept" shaping — just the truthful default, evidence-anchored.
    expect(call.body).not.toContain('converged');
    expect(call.body).toContain('Evidence: task t1, artifact a1.');
  });
});
