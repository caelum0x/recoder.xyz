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
 */
import type { TaskSpec } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { buildTaskContextPack } from '../git-context.js';
import { fetchLibraryDocs, isContext7Available } from '../context7.js';
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
 * Build the enriched prompt + provenance. Always returns a usable prompt; missing
 * sources are simply omitted (never faked).
 */
export async function enrichPrompt(input: EnrichPromptInput): Promise<EnrichedPrompt> {
  const sections: string[] = [];
  const sources: string[] = [];

  if (input.taskId) {
    try {
      const task = await findTask(input.taskId);
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

  if (!sections.length) {
    return { prompt: input.prompt, sources };
  }

  const prompt = `${sections.join('\n\n')}\n\n## Instruction\n${input.prompt}`;
  logger.info({ taskId: input.taskId, sources }, 'prompt enriched');
  return { prompt, sources };
}
