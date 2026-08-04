/**
 * Introspection reads behind the `ConductorComposer` facade: substrate/runtime
 * availability, GitHub identity + repo listing, the local clone seam, and the
 * per-check PR rollup. Every method body moved VERBATIM from the composer.
 */
import type { SubstrateAvailabilityView } from '../types.js';
import type { GithubStatusView, GithubRepoView } from '../ports/index.js';
import {
  listConductorRuntimes,
  type ConductorRuntimeView,
} from '../adapters/runtime-listing.adapter.js';
import type {
  CloneRepoInput,
  CloneRepoOutcome,
} from '../services/repo-clone.service.js';
import type { WorkspaceChecksView } from '../services/pr-checks.service.js';
import type { ConductorContext } from './shared.js';

export class ConductorIntrospection {
  constructor(private readonly ctx: ConductorContext) {}

  async substrates(): Promise<readonly SubstrateAvailabilityView[]> {
    return this.ctx.registry.availability();
  }

  /**
   * Every selectable runtime with truthful availability: PATH-probed CLIs plus
   * the native in-process openfang runtime (live engine probe via its
   * registered substrate — unwired/engine-absent ⇒ `available:false` + reason).
   */
  async runtimes(): Promise<readonly ConductorRuntimeView[]> {
    return listConductorRuntimes({ registry: this.ctx.registry });
  }

  async githubStatus(): Promise<GithubStatusView> {
    if (!this.ctx.github) return { connected: false, source: null };
    return this.ctx.github.status();
  }

  async githubRepos(): Promise<readonly GithubRepoView[]> {
    if (!this.ctx.github) return [];
    return this.ctx.github.repos();
  }

  /**
   * Clone a GitHub repo onto the box (`POST /repos/clone`). Ungated like the
   * other local-box reads/probes on this surface: it writes only a fresh
   * directory under the caller-chosen (or default) repos dir — every workspace
   * launched FROM it still passes the governed `workspace.create` gate. Never
   * throws: every failure is a typed, truthful outcome.
   */
  async cloneRepo(input: CloneRepoInput): Promise<CloneRepoOutcome> {
    return this.ctx.repoClone.clone(input);
  }

  /**
   * The workspace's per-check PR rollup (`GET …/checks`) via `gh pr view` run
   * in the worktree. Null when the workspace does not exist (→ 404 at the
   * edge); otherwise ALWAYS a truthful view (`available:false` + reason when
   * gh/auth/PR/GitHub-remote is absent — never fabricated).
   */
  async workspaceChecks(
    workspaceId: string
  ): Promise<WorkspaceChecksView | null> {
    const workspace = await this.ctx.getWorkspace(workspaceId);
    if (!workspace) return null;
    return this.ctx.prChecks.checks(workspace);
  }
}
