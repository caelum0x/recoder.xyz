/**
 * Conductor context routes — the @recoder/brain consumer seam on the product
 * run loop. This module owns two halves of the same fusion seam:
 *
 *   1. INGEST (`POST /context/ingest`) — RAG/context ingest. A raw document
 *      (text/markdown/PDF) is preprocessed through the owned
 *      @recoder/document-preprocessor and its clean text is remembered via the
 *      brain's memory port (mem0), so a later assemble()/recall() can surface it.
 *
 *   2. ASSEMBLE (`POST /context/assemble`) — the BRAIN-CONTEXT ASSEMBLY SEAM.
 *      The real end-to-end capability the conductor needs: a launching agent (or
 *      the operator console preparing one) asks for the fused BrainContext for a
 *      task/repo and gets back a GENUINE assembled context — the recodergit
 *      repo-intel slice, recalled memory (including anything ingested above),
 *      RAG passages, context7 docs, the beads task graph, and continuum activity
 *      — plus truthful per-source provenance and a launch-ready prompt block. The
 *      ingest seam alone only writes memory; THIS seam is what makes a real
 *      BrainContext available to the agent that is about to run.
 *
 * Both halves delegate to the shared, flag-gated {@link BrainService}
 * (agentOsContainer.brain). That service is the single Brain instance the
 * conductor instruction bundle (bundle.ts) and the cache doctor also read, so an
 * ingest here genuinely enriches a later assemble there, and assembling here is
 * the SAME cached fusion — not a throwaway.
 *
 * DEGRADE-SAFE end to end (matching the conductor coordination posture):
 *   - flag OFF  -> ingest reports { enabled:false, remembered:false }; assemble
 *                  reports { enabled:false, context:null } — honest "did not run",
 *                  never a fabricated success.
 *   - source dark (no mem0 key / no recodergit / no context7 / ...) -> that source
 *                  degrades to empty with truthful provenance; assembly still
 *                  returns whatever lit up. A launch NEVER hard-depends on the brain.
 *   - any throw -> caught, logged, degraded; the request never crashes and a
 *                  launch is never blocked on this layer.
 *
 * Ownership: this is the canonical home for the conductor context routes. The
 * router is exported as a factory so the conductor router can mount it, and so it
 * is independently testable (the same router-stack harness as the agent-os route
 * tests).
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (layer 6 — knowledge in the loop) and
 * docs/subsystems/brain.md.
 */
import { Router, type Request, type Response } from 'express';
import type { BrainContext } from '@recoder/brain';
import type { TaskSpec } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import type { BrainService } from '../agent-os/brain-service';
import { createLogger } from '../logger';

const logger = createLogger('conductor:context');

const ALLOWED_FORMATS = new Set(['text', 'markdown', 'pdf']);
type DocFormat = 'text' | 'markdown' | 'pdf';

/**
 * What `POST /context/assemble` returns to a launching agent. `enabled` reflects
 * the RECODER_BRAIN_ENABLED gate; `context` is the genuine fused BrainContext (or
 * null when disabled / fail-safe); `promptBlock` is a launch-ready, labeled,
 * provenance-carrying rendering of that context for direct prompt injection; and
 * `sources` is the truthful list of sources that actually contributed.
 */
export interface AssembleContextResponse {
  /** True when RECODER_BRAIN_ENABLED is truthy (the assemble actually ran). */
  readonly enabled: boolean;
  /** The fused BrainContext, or null when disabled / unavailable / fail-safe. */
  readonly context: BrainContext | null;
  /** A labeled prompt block ready to splice into a launching agent's prompt. */
  readonly promptBlock: string | null;
  /** Truthful provenance: which owned sources lit up for this assemble. */
  readonly sources: string[];
}

export interface ContextRouterDeps {
  /** The shared brain service. Defaults to the live agent-os container brain. */
  brain?: BrainService;
  /** Resolve a TaskSpec by id (for assemble). Defaults to the agent-os repository. */
  findTask?: (taskId: string) => Promise<TaskSpec | undefined>;
}

async function defaultFindTask(taskId: string): Promise<TaskSpec | undefined> {
  const tasks = await Promise.resolve(agentOsContainer.repository.listTasks());
  return tasks.find((t) => t.taskId === taskId);
}

/**
 * Render a fused BrainContext into a labeled, provenance-carrying prompt block a
 * launching agent can inject directly. Only sections with REAL content are
 * emitted — nothing is fabricated; an empty context yields null.
 *
 * Mirrors the rendering the conductor instruction bundle (bundle.ts) appends, so
 * a launch that pre-fetches via this seam gets the same auditable shape.
 */
function renderBrainContext(ctx: BrainContext): string | null {
  const lines: string[] = [];

  const repo = ctx.repo;
  const refs = repo?.sourceRefs ?? [];
  const edges = repo?.dependencyGraph?.edges ?? [];
  const impactedPackages = repo?.impactReport?.impactedPackages ?? [];
  const risks = repo?.impactReport?.changedFileRisks ?? [];

  const repoLines: string[] = [];
  if (refs.length) {
    repoLines.push(
      'Source refs (recodergit):',
      ...refs.map((r) => `- [${r.kind}] ${r.ref}${r.detail ? ` — ${r.detail}` : ''}`),
    );
  }
  if (impactedPackages.length) {
    repoLines.push(`Impacted packages: ${impactedPackages.join(', ')}`);
  }
  if (risks.length) {
    repoLines.push(
      'Changed-file risk:',
      ...risks.map((r) => `- [${r.risk}] ${r.path} — ${r.reason}`),
    );
  }
  if (edges.length) {
    repoLines.push(
      'Dependency edges:',
      ...edges.slice(0, 20).map((e) => `- ${e.from} --${e.kind}--> ${e.to}`),
    );
  }
  if (repoLines.length) lines.push('### Code graph (recodergit)', ...repoLines, '');

  if (ctx.memories?.length) {
    lines.push(
      '### Recalled memory (mem0)',
      ...ctx.memories.map(
        (m) => `- ${m.text}${typeof m.score === 'number' ? ` (score ${m.score.toFixed(2)})` : ''}`,
      ),
      '',
    );
  }

  // Passage-level RAG hits (ctx.passages) are an additive, optional field the
  // brain only populates when a vector-store port is wired. The build the backend
  // resolves does not yet surface that field, so we render the ingested-document
  // corpus via the memory recall above (the on-path rag→memory→assemble flow) and
  // omit a passages section here. This stays degrade-safe and fabricates nothing.

  if (ctx.docs?.length) {
    lines.push(
      '### Docs (context7)',
      ...ctx.docs.map(
        (d) =>
          `- ${d.library}${d.title ? ` — ${d.title}` : ''}${d.url ? ` (${d.url})` : ''}: ${d.snippet}`,
      ),
      '',
    );
  }

  if (ctx.tasks?.length) {
    lines.push(
      '### Related task graph (beads)',
      ...ctx.tasks.map((t) => `- ${t.id} [${t.status}] ${t.title}`),
      '',
    );
  }

  const activity = ctx.activity;
  if (activity?.profile?.brief || activity?.recent?.length) {
    lines.push('### Activity context (continuum)');
    if (activity.profile?.brief) lines.push(`Profile: ${activity.profile.brief}`);
    if (activity.recent?.length) {
      lines.push(...activity.recent.map((a) => `- [${a.when}] ${a.app} (${a.who}/${a.type}): ${a.text}`));
    }
    lines.push('');
  }

  if (!lines.length) return null;

  return [
    '## Fused brain context (@recoder/brain)',
    `_Assembled ${ctx.assembledAt}. Provenance below is from owned sources; do not treat as ground truth without verifying._`,
    '',
    ...lines,
  ]
    .join('\n')
    .trimEnd();
}

/**
 * Truthful list of which owned sources actually contributed to this context.
 * Prefers the brain's own provenance (the engine records contributed/itemCount
 * per source); falls back to inspecting the populated fields when an older
 * serialized context carries no provenance. Never claims a source that is empty.
 */
function contributingSources(ctx: BrainContext): string[] {
  if (ctx.provenance?.sources?.length) {
    return ctx.provenance.sources
      .filter((s) => s.contributed && s.itemCount > 0)
      .map((s) => s.source);
  }
  const sources: string[] = [];
  if ((ctx.repo?.sourceRefs?.length ?? 0) > 0) sources.push('repo');
  if (ctx.memories?.length) sources.push('memory');
  if (ctx.docs?.length) sources.push('docs');
  if (ctx.tasks?.length) sources.push('tasks');
  if (ctx.activity?.recent?.length || ctx.activity?.profile?.brief) sources.push('activity');
  return sources;
}

/**
 * Build the conductor context router (ingest + assemble). Degrade-safe and
 * flag-gated via the shared {@link BrainService}.
 */
export function createContextRouter(deps: ContextRouterDeps = {}): Router {
  const router = Router();
  const getBrain = (): BrainService => deps.brain ?? agentOsContainer.brain;
  const findTask = deps.findTask ?? defaultFindTask;

  // --- RAG/context ingest -------------------------------------------------
  // Hand a raw doc to the shared, flag-gated Brain, which preprocesses it
  // through the owned @recoder/document-preprocessor and remembers the clean
  // text via mem0 so a later assemble()/recall() can surface it. In-process;
  // degrade-safe: brain disabled -> { enabled:false }; no preprocessor/memory ->
  // empty/not-remembered. Never blocks, never throws.
  router.post('/context/ingest', async (req: Request, res: Response) => {
    try {
      const { title, content, base64, format } = req.body ?? {};
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, error: 'title is required' });
        return;
      }
      let data: Uint8Array;
      if (typeof base64 === 'string' && base64.length > 0) {
        data = new Uint8Array(Buffer.from(base64, 'base64'));
      } else if (typeof content === 'string') {
        data = new Uint8Array(Buffer.from(content, 'utf8'));
      } else {
        res
          .status(400)
          .json({ success: false, error: 'content (utf8 text) or base64 (bytes) is required' });
        return;
      }
      const docFormat: DocFormat = ALLOWED_FORMATS.has(format) ? (format as DocFormat) : 'text';
      const result = await getBrain().ingestDocument({ title, data, format: docFormat });
      res.json({ success: true, data: result });
    } catch (err) {
      // BrainService already degrades fail-safe; belt-and-suspenders so a
      // malformed body never crashes the request path.
      res
        .status(500)
        .json({ success: false, error: err instanceof Error ? err.message : 'context ingest failed' });
    }
  });

  // --- Brain-context assembly seam ---------------------------------------
  // Assemble the genuine fused BrainContext for a launching agent: the
  // recodergit repo-intel slice + recalled memory (incl. text ingested above via
  // /context/ingest) + context7 docs + the beads task graph + continuum activity,
  // with truthful provenance and a launch-ready prompt block. This is what makes a
  // REAL BrainContext available to the agent about to run — not just ingest.
  //
  // Body: { repoPath: string, taskId?: string, prompt?: string, focusFiles?: string[], limit?: number }
  //   - taskId resolves the full TaskSpec so the context pack's impact report /
  //     provenance are keyed to the real task; otherwise `prompt` (or taskId/
  //     repoPath) seeds the query and focusFiles scope the repo intel.
  //
  // Degrade-safe: flag OFF -> { enabled:false, context:null }; assemble fail-safe
  // -> { enabled:true, context:null }. NEVER blocks a launch — the caller treats
  // a null context exactly as "brain unavailable" and launches with its base prompt.
  router.post('/context/assemble', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const repoPath = typeof body.repoPath === 'string' ? body.repoPath.trim() : '';
      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }
      const taskId = typeof body.taskId === 'string' && body.taskId.trim() ? body.taskId.trim() : undefined;
      const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;
      const focusFiles = Array.isArray(body.focusFiles)
        ? body.focusFiles.filter((f): f is string => typeof f === 'string')
        : undefined;
      const limitRaw = Number(body.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

      const brain = getBrain();
      if (!brain.isEnabled()) {
        const payload: AssembleContextResponse = {
          enabled: false,
          context: null,
          promptBlock: null,
          sources: [],
        };
        res.json({ success: true, data: payload });
        return;
      }

      // Resolve the task title for the assemble query. A resolved TaskSpec gives
      // the richest result (its targetPaths scope repo intel); fall back to the
      // explicit prompt, then the taskId, then the repoPath so the query is never
      // empty. Task lookup failure is non-fatal — assembly proceeds on the prompt.
      let task: TaskSpec | undefined;
      if (taskId) {
        try {
          task = await findTask(taskId);
        } catch (err) {
          logger.warn({ taskId, err }, 'task lookup failed for assemble — proceeding without spec');
        }
      }
      const taskText = prompt ?? task?.title ?? taskId ?? repoPath;

      // The genuine fusion read on the SHARED brain (same cached instance the
      // instruction bundle uses). Returns null on the flag-off/fail-safe path.
      const context = await brain.assembleForTask({
        task: taskText,
        repoRoot: repoPath,
        focusFiles: focusFiles ?? task?.targetPaths,
        limit,
      });

      if (!context) {
        // Enabled but fail-safe (assemble degraded). Honest: ran but nothing.
        const payload: AssembleContextResponse = {
          enabled: true,
          context: null,
          promptBlock: null,
          sources: [],
        };
        res.json({ success: true, data: payload });
        return;
      }

      const promptBlock = renderBrainContext(context);
      const sources = contributingSources(context);
      logger.info({ taskId, repoPath, sources }, 'brain context assembled for launch');
      const payload: AssembleContextResponse = {
        enabled: true,
        context,
        promptBlock,
        sources,
      };
      res.json({ success: true, data: payload });
    } catch (err) {
      // BrainService.assembleForTask is already fail-safe; this guard ensures a
      // malformed body or unexpected throw never blocks a launch or crashes the path.
      logger.warn({ err }, 'context assemble errored — degrading (launch proceeds on base prompt)');
      const payload: AssembleContextResponse = {
        enabled: true,
        context: null,
        promptBlock: null,
        sources: [],
      };
      res.json({ success: true, data: payload });
    }
  });

  return router;
}
