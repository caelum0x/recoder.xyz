/**
 * SECURITY — the workspace-resolution seam for the governed SKILL MODEL.
 *
 * The MCP `recoder_skill_invoke` surface accepts a caller-supplied `workspace`.
 * That value is UNTRUSTED model/client output: a traversal (`../../../../etc`) or
 * absolute-outside (`/etc`) string must NEVER be trusted as a filesystem path an
 * action then executes in. This seam is the ONE authority that turns the supplied
 * value into a TRUSTED, server-side checkout path — or REFUSES.
 *
 * The trust model is IDENTITY, not string-shape: the supplied value is treated as a
 * KNOWN workspace id, looked up in the conductor's own workspace store, and admitted
 * ONLY when the record is OWNED by the acting subject and carries a real server-side
 * checkout path (`worktreePath`). Every failure — unknown id, non-owned record,
 * traversal / absolute-outside string (which simply matches no record), or a record
 * with no checkout path — is a truthful `{ ok: false, reason }`, never a fallback to
 * trusting the raw string. The resolved path is the store's own `worktreePath`, so a
 * client can never widen the executor's reach beyond a worktree it actually owns.
 */

/** The truthful outcome of resolving a supplied workspace to a trusted checkout path. */
export type SkillWorkspaceResolution =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The injected workspace-resolution seam. Given the caller-supplied `workspace` and
 * the host-authorized `actorId`, it returns the TRUSTED server-side checkout path or
 * a truthful refusal. The service consults it BEFORE building the policy input and
 * BEFORE the executor; the executor + policy then use the resolved path, never the
 * raw client string.
 */
export interface SkillWorkspaceResolver {
  resolve(input: {
    readonly workspace: string;
    readonly actorId: string;
  }): SkillWorkspaceResolution | Promise<SkillWorkspaceResolution>;
}

/**
 * The narrow, structural view of the conductor workspace store this resolver reads.
 * Structurally satisfied by the composer's `getWorkspace(id)` (which returns the full
 * durable `Workspace` record). Kept minimal so the resolver depends on a contract,
 * not the whole conductor.
 */
export interface OwnedWorkspaceLookup {
  getWorkspace(workspaceId: string): Promise<{
    /** The durable owner of the workspace (`createdBy`). */
    readonly createdBy: string;
    /** The REAL server-side checkout path (absent for non-local substrates). */
    readonly worktreePath?: string;
    /** Durable governed-action policy profile (shape validated by the policy layer). */
    readonly policyProfile?: unknown;
  } | null>;
}

/**
 * Build the owned-workspace resolver bound to the conductor workspace store. It
 * resolves the supplied value AS A WORKSPACE ID (never as a raw path): unknown ⇒
 * refuse, not-owned-by-actor ⇒ refuse, no server-side checkout path ⇒ refuse; an
 * owned record with a `worktreePath` ⇒ that trusted path. Because the value is a
 * lookup key, a traversal / absolute-outside string simply resolves to no record and
 * is refused — the raw string is never handed downstream.
 */
export function createOwnedWorkspaceResolver(
  lookup: OwnedWorkspaceLookup,
): SkillWorkspaceResolver {
  return {
    async resolve({ workspace, actorId }): Promise<SkillWorkspaceResolution> {
      const workspaceId = typeof workspace === 'string' ? workspace.trim() : '';
      if (!workspaceId) {
        return { ok: false, reason: 'a target workspace id is required' };
      }
      const actor = typeof actorId === 'string' ? actorId.trim() : '';
      if (!actor) {
        return { ok: false, reason: 'an authenticated actor identity is required' };
      }

      const record = await lookup.getWorkspace(workspaceId);
      if (!record) {
        // Unknown id — and traversal / absolute-outside strings land here too, since
        // they match no owned workspace. No oracle: a truthful "unknown", never trust.
        return { ok: false, reason: `unknown workspace: ${workspaceId}` };
      }
      if (record.createdBy !== actor) {
        return {
          ok: false,
          reason: 'workspace is not owned by the acting subject',
        };
      }
      const path =
        typeof record.worktreePath === 'string' ? record.worktreePath.trim() : '';
      if (!path) {
        return {
          ok: false,
          reason: 'workspace has no server-side checkout path to execute in',
        };
      }
      return { ok: true, path };
    },
  };
}
