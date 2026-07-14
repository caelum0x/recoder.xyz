/**
 * Simple-local-create normalizer for POST /api/conductor/workspaces.
 *
 * The full control-plane create path requires the canonical identity fields
 * (`spaceId`, `projectId`, `taskId`, `createdBy`). The embedded desktop cockpit
 * form, however, only knows about the local repo it is pointed at: it sends a
 * minimal body of `{ repoPath, prompt?, runtimeId?, substrate? }`. Rejecting that
 * body at ingress breaks the simplest, most common create flow.
 *
 * This normalizer DEFAULTS only the missing identity fields for a simple local
 * create. Any caller-provided value always wins, so full-payload callers (cloud,
 * A2A, orchestrated runs) pass through completely unchanged.
 *
 *   spaceId   → 'default'
 *   projectId → basename(repoPath) || 'local'
 *   taskId    → a generated unique id (`local-<basename>-<uuid>`)
 *   createdBy → body.createdBy || 'desktop-user'
 *
 * It does NOT invent a `prompt`/`command`: at least one of those is a genuine
 * caller intent and must still be supplied (validated by the route).
 */
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Trim a string field and return undefined if it is empty/non-string. */
function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Derive a stable, filesystem-safe project id from a repo path. Falls back to
 * `'local'` when the path is empty or resolves to a root-like segment.
 */
export function projectIdFromRepoPath(repoPath: string): string {
  const base = basename(repoPath.replace(/[/\\]+$/, '')).trim();
  return base || 'local';
}

export interface SimpleCreateDefaults {
  spaceId: string;
  projectId: string;
  taskId: string;
  createdBy: string;
}

/**
 * Compute the defaulted identity fields for a simple local create, given the
 * already-resolved `repoPath` and the (optional) caller-provided values from the
 * request body. Pure and deterministic except for the generated `taskId`.
 */
export function deriveSimpleCreateDefaults(
  repoPath: string,
  body: { spaceId?: unknown; projectId?: unknown; taskId?: unknown; createdBy?: unknown },
): SimpleCreateDefaults {
  const projectId = cleanString(body.projectId) ?? projectIdFromRepoPath(repoPath);
  return {
    spaceId: cleanString(body.spaceId) ?? 'default',
    projectId,
    taskId: cleanString(body.taskId) ?? `local-${projectId}-${randomUUID()}`,
    createdBy: cleanString(body.createdBy) ?? 'desktop-user',
  };
}

/**
 * Normalize a raw POST /workspaces body for the simple local-create path:
 * default the missing identity fields while preserving every caller-provided
 * value (full-payload callers are untouched). The caller is still responsible
 * for validating that `repoPath` and one of `command|prompt` are present —
 * those carry real intent and are never invented here.
 *
 * Returns the same shape as the incoming body, with the four identity fields
 * guaranteed to be non-empty strings when `repoPath` is present.
 */
export function normalizeCreateBody<T extends object>(
  body: T,
): T & Partial<SimpleCreateDefaults> {
  const source = body as Record<string, unknown>;
  const repoPath = cleanString(source.repoPath);
  // Without a repoPath there is nothing to derive a project id from; leave the
  // body untouched so the route's own validation surfaces the missing field.
  if (!repoPath) return body;
  const defaults = deriveSimpleCreateDefaults(repoPath, source);
  return { ...body, ...defaults };
}
