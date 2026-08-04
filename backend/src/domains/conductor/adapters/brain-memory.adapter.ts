/**
 * brain-memory.adapter — the conductor's memory-backed brain seam.
 *
 * This is the ONE conductor-side adapter that reaches the LIVE memory domain to
 * close the "recall on launch / harvest on completion" loop the AGENTS policy
 * describes. It implements the substrate `BrainPort` (so it can be injected as
 * `engineDeps.brain` and drive `WorkspaceEngine.enrichPrompt` on the CLI launch
 * path) and adds a `harvestOnCompletion` method the run-completion sink fires on
 * terminal events.
 *
 * Pipeline (launch → enrich):
 *   recall.recall({ query: prompt, userId, scope })   ← mem0 ∪ beads ∪ candidates ∪ items → ColBERT rerank
 *     → a DEGRADED rerank (colbert down ⇒ lexical/identity fallback) is surfaced
 *       as a `recall-rerank` provenance ref (`degraded:<reranker>: <reason>`) so
 *       the audit trail never implies late-interaction ranking that did not run
 *     → prepend a "## Recalled context" block
 *     → (optional) retrieval.search(prompt)            ← repo RAG passages
 *     → prepend a "## Repository context" block
 *     → BrainEnrichResult { prompt, sources }          ← truthful provenance for every enrichment
 *
 * Pipeline (completion → harvest):
 *   harvest.harvest({ userId, scope, title, body, taskId, artifactId, proposedBy })
 *     → EPHEMERAL candidate wisp only (never durable — that is the governed accept path)
 *
 * SEAM LAW (degrade-safe, truthful):
 *  - Never throws across the boundary. A faulted engine degrades to the identity
 *    result (original prompt + `sources: []`) or a truthful `{ harvested: false }`.
 *  - Never fabricates. Provenance always points at a real source ref; an empty
 *    recall yields the original prompt unchanged.
 *  - Recall/retrieval only run when a `userId` is known; without it the launch
 *    proceeds on the raw prompt (no cross-tenant leak, no guessing).
 */
import type { Logger } from '../../../shared/logger.js';
import type {
  BrainPort,
  BrainEnrichInput,
  BrainEnrichResult,
  BrainProvenanceRef,
} from '../ports/brain.port.js';
import type { RecallService } from '../../memory/recall/recall-fusion.js';
import type { RecallQuery, RecalledMemory } from '../../memory/types.js';
import type { RetrievalPort } from '../../memory/ports/retrieval.port.js';
import type { HarvestService, HarvestResult } from '../../memory/lifecycle/harvest.js';
import type { MemoryScope } from '../../memory/lifecycle/candidate-service.js';
// Conductor-domain: the shaping folds conductor's own convergence provenance
// into a reusable lesson body (moved out of memory/lifecycle to keep the
// domain-boundary invariant — a memory-domain VALUE import here was illegal).
import {
  hasConvergenceProvenance,
  shapeHarvestBody,
  shapeHarvestTitle,
  type HarvestShapeInput,
} from './harvest-shaping.js';

/** Section headers for the enriched prompt (stable, greppable, non-secret). */
const RECALLED_HEADER = '## Recalled context';
const REPO_HEADER = '## Repository context';

/** Provenance source tag for the truthful degraded-rerank marker. */
const RERANK_SOURCE = 'recall-rerank';

/** Defaults kept small — enrichment is a hint, not the whole prompt. */
const DEFAULT_MAX_RECALL = 6;
const DEFAULT_MAX_PASSAGES = 4;

/**
 * Input the completion sink hands `harvestOnCompletion`. Derived from the
 * terminal `RunEvent` + the owning workspace (the sink resolves `userId`,
 * `artifactId`, and the memory `scope`; this adapter only shapes + degrades).
 */
export interface RunHarvestInput {
  /** App-layer owner id (workspace.createdBy). Absent ⇒ harvest skipped. */
  readonly userId: string;
  /** Scope the wisp is filed under (defaults to `task-type`). */
  readonly scope?: MemoryScope;
  /** The task the run served — half of the required evidence anchor. */
  readonly taskId: string;
  /** The run artifact — the other half of the required evidence anchor. */
  readonly artifactId: string;
  /** The run id (for the wisp body context). */
  readonly runId?: string;
  /** Terminal outcome of the run. */
  readonly outcome: 'completed' | 'failed';
  /** Optional distilled fact title; defaulted from the run when absent. */
  readonly title?: string;
  /** Optional distilled fact body; defaulted from the run when absent. */
  readonly body?: string;
  /** Who/what produced the fact (agent id or principal id). */
  readonly proposedBy?: string;
  /** Optional bd id this was discovered from. */
  readonly discoveredFrom?: string;
  /**
   * Repo the run operated on (path/display). When present it is embedded in the
   * shaped lesson body so a LATER run on the same repo can repo-match it — the
   * cross-RUN link that makes the memory compound (thesis §7).
   */
  readonly repo?: string;
  /** Human task title for the shaped lesson (falls back to the taskId). */
  readonly taskTitle?: string;
  /** How many parallel agents converged into the winning result (convergence provenance). */
  readonly convergedAgents?: number;
  /** Short signal of the approach the merge kept (the reusable lesson). */
  readonly winningApproach?: string;
  /** Paths the agents contested (the risky surface for the next run). */
  readonly contestedPaths?: readonly string[];
  /** Whether the run's verification passed (distinct from merely completing). */
  readonly verified?: boolean;
}

/** The conductor brain: a substrate `BrainPort` plus the completion harvest hook. */
export interface ConductorBrainMemory extends BrainPort {
  /**
   * Harvest an evidence-backed memory candidate from a finished run. Best-effort:
   * a slow/absent memory engine or a missing evidence anchor degrades to a
   * truthful `{ harvested: false, reason }` and NEVER rethrows into the terminal
   * event path.
   */
  harvestOnCompletion(input: RunHarvestInput): Promise<HarvestResult>;
}

export interface BrainMemoryAdapterDeps {
  /** Fusion recall (mem0 ∪ beads ∪ candidates ∪ items → rerank). Memory module public seam. */
  readonly recall: RecallService;
  /** Run-completion harvest (evidence-backed candidate). Memory module public seam. */
  readonly harvest: HarvestService;
  /** Optional RAG facade for repo context. Omitted / unconfigured ⇒ recall-only enrich. */
  readonly retrieval?: RetrievalPort;
  readonly logger: Logger;
  /** Cap on recalled memories folded into the prompt (default 6). */
  readonly maxRecall?: number;
  /** Cap on retrieval passages folded into the prompt (default 4). */
  readonly maxPassages?: number;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The scope hint for recall. Follows the design ("scope: taskId | repoPath"):
 * the task id narrows first, else the repo path. Absent ⇒ recall spans the
 * user's whole memory (no narrowing). A non-matching scope simply yields fewer
 * memories — still truthful, never an error.
 */
function recallScope(input: BrainEnrichInput): string | undefined {
  const task = input.taskId?.trim();
  if (task) return task;
  const repo = input.repoPath?.trim();
  return repo ? repo : undefined;
}

/**
 * Render one recalled memory as a bullet, tagged with its source AND — when the
 * scope-boost surfaced it for a reason — WHY it surfaced (`repo-match`/`recency`/
 * `lexical`). Unsignalled memories keep the original `[source]` tag exactly, so
 * the audit trail only ever states a reason that genuinely fired.
 */
function renderMemory(memory: RecalledMemory): string {
  const label = memory.title?.trim() ? `${memory.title.trim()}: ` : '';
  const body = memory.body.trim().replace(/\s+/g, ' ');
  const signals = memory.provenance.signals;
  const tag = signals && signals.length > 0
    ? `${memory.provenance.source} · why: ${signals.join(', ')}`
    : memory.provenance.source;
  return `- [${tag}] ${label}${body}`;
}

/**
 * Build the conductor's memory-backed brain over the memory domain's public
 * seams. Synchronous factory — no probing; every engine self-degrades on call.
 */
export function createBrainMemoryAdapter(deps: BrainMemoryAdapterDeps): ConductorBrainMemory {
  const { recall, harvest, retrieval, logger } = deps;
  const maxRecall = deps.maxRecall ?? DEFAULT_MAX_RECALL;
  const maxPassages = deps.maxPassages ?? DEFAULT_MAX_PASSAGES;

  /** Recall fusion → memory bullets + provenance. Faults degrade to empty. */
  async function recallForLaunch(
    input: BrainEnrichInput,
    userId: string,
  ): Promise<{ block: string; sources: BrainProvenanceRef[] }> {
    const scope = recallScope(input);
    // Thread the repo the run targets so the scope-boost can rank a lesson
    // harvested on THIS repo above generic matches (cross-RUN scoping).
    const repoRef = input.repoPath?.trim();
    const query: RecallQuery = {
      query: input.prompt,
      userId,
      limit: maxRecall,
      ...(scope ? { scope } : {}),
      ...(repoRef ? { repoRef } : {}),
    };
    try {
      const result = await recall.recall(query);
      const memories = result.memories.slice(0, maxRecall);
      if (memories.length === 0) return { block: '', sources: [] };
      const block = [RECALLED_HEADER, ...memories.map(renderMemory)].join('\n');
      const sources = memories.map<BrainProvenanceRef>((m) => ({
        source: m.provenance.source,
        ref: m.provenance.ref,
      }));
      // TRUTHFUL DEGRADE MARKER: recall reported a degraded rerank (colbert did
      // not rank a multi-memory pool) — carry that into the enrichment
      // provenance so nothing downstream mistakes fallback order for ranking.
      if (result.rerankerReason) {
        sources.push({
          source: RERANK_SOURCE,
          ref: `degraded:${result.reranker}: ${result.rerankerReason}`,
        });
      }
      return { block, sources };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'conductor brain: recall faulted (launch continues on raw prompt)');
      return { block: '', sources: [] };
    }
  }

  /** Optional repo RAG passages → context bullets + provenance. Degrade-safe. */
  async function retrieveRepoContext(
    input: BrainEnrichInput,
  ): Promise<{ block: string; sources: BrainProvenanceRef[] }> {
    if (!retrieval) return { block: '', sources: [] };
    try {
      if (!retrieval.configured()) return { block: '', sources: [] };
      // Point the ColBERT first stage at the conductor-built per-repo PLAID index
      // when the launch resolved one (`repoCollection`); absent ⇒ retrieval uses
      // its default collection (today's behavior). This is what CLOSES the dead
      // write: the `repo_<id>` index built on workspace create is finally read.
      const repoCollection = input.repoCollection?.trim();
      const searchOpts = repoCollection
        ? { topK: maxPassages, colbertCollection: repoCollection }
        : { topK: maxPassages };
      const result = await retrieval.search(input.prompt, searchOpts);
      if (result.status !== 'ok' || result.passages.length === 0) return { block: '', sources: [] };
      const passages = result.passages.slice(0, maxPassages);
      const lines = passages.map((p) => {
        const label = p.source?.trim() ? `${p.source.trim()}: ` : '';
        return `- ${label}${p.text.trim().replace(/\s+/g, ' ')}`;
      });
      const block = [REPO_HEADER, ...lines].join('\n');
      const sources = passages.map<BrainProvenanceRef>((p) => ({
        source: 'retrieval',
        ref: String(p.docId ?? p.id),
      }));
      return { block, sources };
    } catch (err) {
      logger.warn({ err: errText(err) }, 'conductor brain: retrieval faulted (enrich skips repo context)');
      return { block: '', sources: [] };
    }
  }

  return {
    async enrichPrompt(input: BrainEnrichInput): Promise<BrainEnrichResult> {
      const prompt = input.prompt ?? '';
      const userId = input.userId?.trim();
      // No tenant ⇒ no recall (never guess across tenants). Truthful identity result.
      if (!userId || prompt.trim().length === 0) {
        return { prompt, sources: [] };
      }

      const [recalled, repoCtx] = await Promise.all([
        recallForLaunch(input, userId),
        retrieveRepoContext(input),
      ]);

      const blocks = [recalled.block, repoCtx.block].filter((b) => b.length > 0);
      const sources = [...recalled.sources, ...repoCtx.sources];

      // Nothing recalled ⇒ hand back the raw prompt unchanged (never fabricate).
      if (blocks.length === 0) return { prompt, sources: [] };

      const enriched = [...blocks, prompt].join('\n\n');
      return { prompt: enriched, sources };
    },

    async harvestOnCompletion(input: RunHarvestInput): Promise<HarvestResult> {
      const userId = input.userId?.trim();
      // No owner ⇒ can't file a tenant-scoped wisp. Truthful skip.
      if (!userId) {
        return { harvested: false, reason: 'harvest skipped: no userId on the run' };
      }

      // HARVEST SHAPING: when the run carries convergence provenance, distil a
      // STRUCTURED, reusable lesson ("On <repo>, task …: converged N agents; kept
      // <winning>; contested <paths>; verified <pass/fail>.") so the candidate is
      // a convention a later run can act on — not a raw log line. An explicit
      // caller-supplied title/body always wins; else the shaped lesson; else the
      // plain default. It stays a CANDIDATE (promotion is human/policy-gated).
      const shape = toShapeInput(input);
      const shaped = hasConvergenceProvenance(shape);
      const title = input.title?.trim() || (shaped ? shapeHarvestTitle(shape) : defaultTitle(input));
      const body = input.body?.trim() || (shaped ? shapeHarvestBody(shape) : defaultBody(input));

      try {
        return await harvest.harvest({
          userId,
          scope: input.scope ?? 'task-type',
          title,
          body,
          proposedBy: input.proposedBy?.trim() || 'conductor',
          taskId: input.taskId,
          artifactId: input.artifactId,
          ...(input.discoveredFrom ? { discoveredFrom: input.discoveredFrom } : {}),
        });
      } catch (err) {
        // harvest.harvest is already non-throwing; this is belt-and-suspenders so
        // a terminal-event handler NEVER sees an exception from memory.
        const reason = errText(err);
        logger.warn({ err: reason, taskId: input.taskId }, 'conductor brain: harvest faulted (run completion not blocked)');
        return { harvested: false, reason };
      }
    },
  };
}

/** Project the harvest input onto the pure shaping input (convergence provenance). */
function toShapeInput(input: RunHarvestInput): HarvestShapeInput {
  return {
    taskId: input.taskId,
    artifactId: input.artifactId,
    outcome: input.outcome,
    ...(input.repo !== undefined ? { repo: input.repo } : {}),
    ...(input.taskTitle !== undefined ? { taskTitle: input.taskTitle } : {}),
    ...(input.convergedAgents !== undefined ? { convergedAgents: input.convergedAgents } : {}),
    ...(input.winningApproach !== undefined ? { winningApproach: input.winningApproach } : {}),
    ...(input.contestedPaths !== undefined ? { contestedPaths: input.contestedPaths } : {}),
    ...(input.verified !== undefined ? { verified: input.verified } : {}),
  };
}

/** A truthful default wisp title when the sink supplies no distilled fact. */
function defaultTitle(input: RunHarvestInput): string {
  return input.outcome === 'completed'
    ? `Run ${input.runId ?? input.taskId} completed`
    : `Run ${input.runId ?? input.taskId} failed`;
}

/** A truthful default wisp body citing the run as its own evidence. */
function defaultBody(input: RunHarvestInput): string {
  const run = input.runId ? `run ${input.runId} ` : '';
  return `Workspace ${run}for task ${input.taskId} ended with outcome=${input.outcome}. `
    + `Evidence: task ${input.taskId}, artifact ${input.artifactId}.`;
}
