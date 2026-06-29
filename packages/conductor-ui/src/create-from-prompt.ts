/**
 * createWorkspaceFromPrompt — the "just give me a prompt" front door.
 *
 * The backend POST /workspaces handler hard-requires spaceId, projectId, taskId,
 * repoPath, runtimeId, createdBy, and one of (prompt | command). This helper
 * default-fills every non-prompt field (deriving stable ids) so a web caller only
 * has to supply a prompt, while still letting them override any field.
 */
import type { ConductorClient } from './client.js';
import type { CreateWorkspaceInput, Workspace } from './types.js';

/** Overridable defaults for {@link createWorkspaceFromPrompt}. */
export interface CreateFromPromptOptions extends Partial<Omit<CreateWorkspaceInput, 'prompt'>> {
  /** Stable slug used to derive default ids when they are not provided. */
  slug?: string;
}

const DEFAULT_RUNTIME_ID = 'claude';

/** Slugify free text into an id-safe token (lowercase, dash-separated). */
function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'task';
}

/**
 * Build a fully-valid {@link CreateWorkspaceInput} from a bare prompt + optional
 * overrides. Pure (no I/O) so it is trivially testable; see
 * {@link createWorkspaceFromPrompt} to also POST it.
 */
export function buildCreateWorkspaceInput(
  prompt: string,
  opts: CreateFromPromptOptions = {},
): CreateWorkspaceInput {
  if (!prompt || !prompt.trim()) {
    throw new Error('createWorkspaceFromPrompt requires a non-empty prompt');
  }
  const seed = opts.slug ?? slugify(prompt);
  const suffix = `${seed}-${Date.now().toString(36)}`;

  return {
    spaceId: opts.spaceId ?? `space-${seed}`,
    projectId: opts.projectId ?? `project-${seed}`,
    taskId: opts.taskId ?? `task-${suffix}`,
    repoPath: opts.repoPath ?? process.cwd?.() ?? '.',
    runtimeId: opts.runtimeId ?? DEFAULT_RUNTIME_ID,
    createdBy: opts.createdBy ?? 'conductor-ui',
    prompt,
    ...(opts.command !== undefined ? { command: opts.command } : {}),
    ...(opts.substrate !== undefined ? { substrate: opts.substrate } : {}),
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.branch !== undefined ? { branch: opts.branch } : {}),
    ...(opts.baseRef !== undefined ? { baseRef: opts.baseRef } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
  };
}

/**
 * Default-fill the conductor create payload from a single prompt and POST it via
 * the given client. Returns the created {@link Workspace}.
 */
export function createWorkspaceFromPrompt(
  client: Pick<ConductorClient, 'createWorkspace'>,
  prompt: string,
  opts: CreateFromPromptOptions = {},
): Promise<Workspace> {
  return client.createWorkspace(buildCreateWorkspaceInput(prompt, opts));
}
