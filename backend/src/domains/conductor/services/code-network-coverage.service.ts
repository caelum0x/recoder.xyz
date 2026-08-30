import type { Workspace } from '@recoder/agent-os';
import type { CodeIntelPort } from '../ports/code-intel.port.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';

export type CodeNetworkRepositoryCoverage = {
  repoId: string;
  status: 'indexed' | 'unavailable';
  reason?: string;
};

export type CodeNetworkCoverage = {
  status: 'idle' | 'indexing' | 'ready' | 'partial' | 'unavailable';
  discoveredRepositories: number;
  indexedRepositories: number;
  unavailableRepositories: number;
  repositories: readonly CodeNetworkRepositoryCoverage[];
  updatedAt?: string;
  reason?: string;
};

type Candidate = { repoId: string; repoPath: string };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Deduplicate persisted workspaces into the newest usable source root per canonical repository. */
export function knownRepositoryCandidates(workspaces: readonly Workspace[]): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const newest = [...workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const workspace of newest) {
    const repoId = text(workspace.metadata?.repoId) ?? text(workspace.projectId);
    const repoPath = text(workspace.metadata?.repoPath) ?? text(workspace.worktreePath);
    if (!repoId || !repoPath || candidates.has(repoId)) continue;
    candidates.set(repoId, { repoId, repoPath });
  }
  return [...candidates.values()].sort((a, b) => a.repoId.localeCompare(b.repoId));
}

export function createCodeNetworkCoverageService(deps: {
  repository: Pick<WorkspaceRepositoryPort, 'listWorkspaces'>;
  codeIntel?: CodeIntelPort;
  now?: () => string;
  concurrency?: number;
}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const concurrency = Math.max(1, Math.min(4, Math.floor(deps.concurrency ?? 2)));
  let state: CodeNetworkCoverage = {
    status: deps.codeIntel ? 'idle' : 'unavailable',
    discoveredRepositories: 0,
    indexedRepositories: 0,
    unavailableRepositories: 0,
    repositories: [],
  };
  let active: Promise<CodeNetworkCoverage> | null = null;

  async function run(): Promise<CodeNetworkCoverage> {
    if (!deps.codeIntel) return state;
    const candidates = knownRepositoryCandidates(await deps.repository.listWorkspaces());
    state = { ...state, status: 'indexing', discoveredRepositories: candidates.length };
    const rows = new Array<CodeNetworkRepositoryCoverage>(candidates.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < candidates.length) {
        const index = cursor++;
        const candidate = candidates[index];
        if (!candidate) continue;
        try {
          const outcome = deps.codeIntel!.indexRepoWithResult
            ? await deps.codeIntel!.indexRepoWithResult(candidate.repoPath, candidate.repoId)
            : (await deps.codeIntel!.indexRepo(candidate.repoPath, candidate.repoId), { indexed: true });
          rows[index] = outcome.indexed
            ? { repoId: candidate.repoId, status: 'indexed' }
            : { repoId: candidate.repoId, status: 'unavailable', ...(outcome.reason ? { reason: outcome.reason } : {}) };
        } catch (error) {
          rows[index] = {
            repoId: candidate.repoId,
            status: 'unavailable',
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, worker));
    const repositories = rows.filter((row): row is CodeNetworkRepositoryCoverage => Boolean(row));
    const indexedRepositories = repositories.filter((row) => row.status === 'indexed').length;
    const unavailableRepositories = repositories.length - indexedRepositories;
    state = {
      status: unavailableRepositories > 0 ? 'partial' : 'ready',
      discoveredRepositories: candidates.length,
      indexedRepositories,
      unavailableRepositories,
      repositories,
      updatedAt: now(),
    };
    return state;
  }

  return {
    coverage: (): CodeNetworkCoverage => state,
    refresh(): Promise<CodeNetworkCoverage> {
      if (!active) {
        active = run()
          .catch((error) => {
            state = {
              ...state,
              status: 'unavailable',
              reason: error instanceof Error ? error.message : String(error),
              updatedAt: now(),
            };
            return state;
          })
          .finally(() => { active = null; });
      }
      return active;
    },
  };
}
