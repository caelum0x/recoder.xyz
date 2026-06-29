/**
 * Conductor instruction bundle — enrich an agent's prompt with owned knowledge
 * before it runs: control-plane task constraints, git-nexus repo context, and
 * context7 library docs.
 *
 * Real, owned integrations only (no fabricated context): the task spec comes from
 * the control plane, git-nexus produces a ContextPack from the repo, and context7
 * fetches docs when a library is named. Each source degrades silently if absent;
 * the returned `sources` list records provenance for the audit trail.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (layer 6 — knowledge in the loop).
 *
 * @recoder/brain seam: when RECODER_BRAIN_ENABLED is truthy, the shared,
 * flag-gated BrainService (agentOsContainer.brain) assembles ONE fused
 * BrainContext (recodergit code-graph slice + mem0 + context7 + beads +
 * continuum activity) and we append it as a clearly-labeled, provenance-carrying
 * block. Flag off / brain unavailable / assemble fail-safe -> existing behavior
 * unchanged. Provenance (sourceRefs) is rendered verbatim; nothing is fabricated.
 */
import type { TaskSpec } from '@recoder/agent-os';
import type { BrainContext } from '@recoder/brain';
import { agentOsContainer } from '../agent-os/service-container';
import { buildTaskContextPack } from '../git-context.js';
import { fetchLibraryDocs, isContext7Available } from '../context7.js';
import { mem0Search } from '../mem0-client.js';
import { colbertRerank } from './colbert-rerank.js';
import { createLogger } from '../logger';

const logger = createLogger('conductor:bundle');

export interface EnrichPromptInput {
  prompt: string;
  taskId?: string;
  repoPath?: string;
  /** Library to pull docs for via context7 (e.g. 'next.js'). */
  library?: string;
  /** Query for the library docs (defaults to the prompt). */
  libraryQuery?: string;
  /** User scope for mem0 recall (e.g. the workspace creator). */
  userId?: string;
}

export interface EnrichedPrompt {
  prompt: string;
  /** Knowledge sources that contributed (provenance). */
  sources: string[];
}

async function findTask(taskId: string): Promise<TaskSpec | undefined> {
  const tasks = await agentOsContainer.repository.listTasks();
  return tasks.find((t) => t.taskId === taskId);
}

function taskConstraints(task: TaskSpec): string[] {
  const lines: string[] = [`## Task: ${task.title}`, task.goal];
  if (task.acceptanceCriteria.length) {
    lines.push('', 'Acceptance criteria:', ...task.acceptanceCriteria.map((c) => `- ${c}`));
  }
  if (task.targetPaths.length) lines.push('', `Target paths: ${task.targetPaths.join(', ')}`);
  if (task.forbiddenPaths.length) lines.push(`Forbidden paths (do not touch): ${task.forbiddenPaths.join(', ')}`);
  if (task.verification.commands.length) {
    lines.push('', 'Verify with:', ...task.verification.commands.map((c) => `- ${c}`));
  }
  return lines;
}

/**
 * Render a fused BrainContext into a labeled, provenance-carrying prompt block.
 *
 * Only sections with real content are emitted (no fabrication). The recodergit
 * code-graph slice (repo.sourceRefs / dependency edges / impacted packages /
 * changed-file risks) is rendered verbatim from the assembled context so it is
 * auditable. Returns null when the context carries no usable signal.
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
      ...ctx.memories.map((m) => `- ${m.text}${typeof m.score === 'number' ? ` (score ${m.score.toFixed(2)})` : ''}`),
      '',
    );
  }

  if (ctx.docs?.length) {
    lines.push(
      '### Docs (context7)',
      ...ctx.docs.map((d) => `- ${d.library}${d.title ? ` — ${d.title}` : ''}${d.url ? ` (${d.url})` : ''}: ${d.snippet}`),
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
  ].join('\n').trimEnd();
}

/**
 * Build the enriched prompt + provenance. Always returns a usable prompt; missing
 * sources are simply omitted (never faked).
 */
export async function enrichPrompt(input: EnrichPromptInput): Promise<EnrichedPrompt> {
  const sections: string[] = [];
  const sources: string[] = [];
  let task: TaskSpec | undefined;

  if (input.taskId) {
    try {
      task = await findTask(input.taskId);
      if (task) {
        sections.push(taskConstraints(task).join('\n'));
        sources.push('agent-os:task');

        if (input.repoPath) {
          const pack = buildTaskContextPack(task, input.repoPath);
          const refs = pack.sourceRefs.map((r) => `- ${r.ref}${r.detail ? ` — ${r.detail}` : ''}`);
          const tests = pack.testTargetMap.targets.map((t) => `- ${typeof t === 'string' ? t : JSON.stringify(t)}`);
          if (refs.length || tests.length) {
            sections.push(
              ['## Repo context (git-nexus)', ...(refs.length ? ['Source refs:', ...refs] : []), ...(tests.length ? ['Related tests:', ...tests] : [])].join('\n'),
            );
            sources.push('git-nexus');
          }
        }
      }
    } catch (err) {
      logger.warn({ taskId: input.taskId, err }, 'task/git-nexus enrichment skipped');
    }
  }

  if (input.userId) {
    try {
      const recall = await mem0Search(input.prompt, { userId: input.userId }, 5);
      if (recall.available && recall.results.length) {
        // ColBERT late-interaction rerank of the recalled memories against the
        // prompt — a genuine call to the optional py/colbert service when
        // COLBERT_RERANK_URL is set. Degrade-safe: unset/down → mem0's order.
        const texts = recall.results.map((r) => r.memory);
        const reranked = await colbertRerank(input.prompt, texts);
        const memories = reranked.passages.map((m) => `- ${m}`);
        const label = reranked.available
          ? '## Relevant memory (mem0, colbert-reranked)'
          : '## Relevant memory (mem0)';
        sections.push([label, ...memories].join('\n'));
        sources.push('mem0');
        if (reranked.available) sources.push('colbert');
      }
    } catch (err) {
      logger.warn({ userId: input.userId, err }, 'mem0 recall skipped');
    }
  }

  if (input.library && isContext7Available()) {
    try {
      const result = await fetchLibraryDocs(input.library, input.libraryQuery || input.prompt);
      if (result.available && result.docs) {
        sections.push(`## Library docs: ${input.library} (context7)\n${result.docs}`);
        sources.push('context7');
      }
    } catch (err) {
      logger.warn({ library: input.library, err }, 'context7 enrichment skipped');
    }
  }

  // @recoder/brain — flag-gated (RECODER_BRAIN_ENABLED, default OFF) fused
  // context. Reuses the shared, fail-safe BrainService; the recodergit
  // code-graph slice flows through repo intel. Degrade-safe: disabled or
  // null/empty -> existing behavior unchanged (never crashes, never fabricates).
  if (input.repoPath) {
    try {
      const brain = agentOsContainer.brain;
      if (brain.isEnabled()) {
        const ctx = await brain.assembleForTask({
          task: task?.title ?? input.prompt,
          repoRoot: input.repoPath,
          focusFiles: task?.targetPaths,
        });
        if (ctx) {
          const block = renderBrainContext(ctx);
          if (block) {
            sections.push(block);
            sources.push('brain');
          }
        }
      }
    } catch (err) {
      logger.warn({ taskId: input.taskId, err }, 'brain enrichment skipped');
    }
  }

  if (!sections.length) {
    return { prompt: input.prompt, sources };
  }

  const prompt = `${sections.join('\n\n')}\n\n## Instruction\n${input.prompt}`;
  logger.info({ taskId: input.taskId, sources }, 'prompt enriched');
  return { prompt, sources };
}
