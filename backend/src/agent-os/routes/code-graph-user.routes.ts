/**
 * User-facing code-graph routes — flag-gated (RECODER_CODE_GRAPH_ENABLED),
 * mounted on the PUBLIC `/api/agent-os` surface behind the same `authenticateRequest`
 * middleware as every other user route. Lets a logged-in user connect a GitHub
 * repo on demand and read back its code graph.
 *
 * SAFETY CONTRACT (binding — .claude/rules/production.md + security.md):
 * - ADDITIVE. Mounted as a sub-router (`/code-graph`) inside `createAgentOsRouter`.
 *   No risky edits to server.ts; no change to existing routes/behavior.
 * - FLAG-GATED. When RECODER_CODE_GRAPH_ENABLED is off every endpoint returns
 *   `{ success:true, data:{ enabled:false } }` (no clone, no engine spawn).
 * - OWNER-SCOPED. Every repo is partitioned by the authenticated `req.userId`.
 *   A user can only see/refresh repos they connected — no cross-user leakage.
 * - TOKEN-SAFE. A private-repo token is taken from the authenticated request,
 *   handed to git out-of-band (GIT_ASKPASS via ENV — see code-graph-clone.ts),
 *   never logged, never returned in a response, never persisted in IndexState.
 * - FAIL-SAFE. The underlying service degrades to 'unavailable'/'not_indexed'/
 *   empty map instead of throwing, so these handlers never 500 from a broken
 *   or absent engine.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';

import {
  RecoderGitService,
  defaultWorkdirRoot,
  type DomainMap,
  type GitProvider,
  type IndexState,
  type IndexStateStore,
  type IndexStatus,
} from '../recodergit-service';
import {
  createAuthenticatedClone,
  isCodeGraphEnabled,
  parseRepoInput,
  type AuthenticatedClone,
} from '../code-graph-clone';

interface OwnerScopedRequest extends Request {
  userId?: string;
}

/** Public, token-free projection of an IndexState for API responses. */
interface PublicRepo {
  repoId: string;
  status: IndexState['status'];
  nodes: number;
  edges: number;
  branch: string | null;
  indexedAt: string;
  cloneUrl: string | null;
}

/** The slice of RecoderGitService the router needs, plus an owner-scoped list. */
export interface CodeGraphUserService {
  connectRepo: RecoderGitService['connectRepo'];
  status: RecoderGitService['status'];
  domainMap: RecoderGitService['domainMap'];
  listRepos: () => IndexState[];
}

/** Builds an owner-scoped service for one request (token captured per-request). */
export type CodeGraphUserServiceFactory = (args: {
  ownerId: string;
  token: string | null;
}) => CodeGraphUserService;

export interface OwnerScopedIndexStore {
  ownerView: (ownerId: string) => IndexStateStore;
  listForOwner: (ownerId: string) => IndexState[];
}

export interface CodeGraphUserRouterDeps {
  /** Reads the gate. Defaults to RECODER_CODE_GRAPH_ENABLED. */
  isEnabled?: () => boolean;
  /** Resolves the logged-in user's GitHub token from the request. Default: body.token. */
  resolveUserGithubToken?: (req: OwnerScopedRequest) => string | null | Promise<string | null>;
  /** Owner-partitioned index store. Defaults to an in-memory store. */
  store?: OwnerScopedIndexStore;
  /** Secure clone. Defaults to the GIT_ASKPASS clone (token via ENV, never argv). */
  authenticatedClone?: AuthenticatedClone;
  /** Per-request service factory. Injected in tests to assert connectRepo calls. */
  serviceFactory?: CodeGraphUserServiceFactory;
  /** Root dir for clones. Defaults to `<DATA_DIR>/code-graph`. */
  workdirRoot?: () => string;
}

/** Default owner-partitioned, in-memory index store. */
export function createOwnerScopedIndexStore(): OwnerScopedIndexStore {
  const byOwner = new Map<string, Map<string, IndexState>>();
  const ensure = (ownerId: string): Map<string, IndexState> => {
    let partition = byOwner.get(ownerId);
    if (!partition) {
      partition = new Map<string, IndexState>();
      byOwner.set(ownerId, partition);
    }
    return partition;
  };
  return {
    ownerView: (ownerId) => ({
      get: (repoId) => ensure(ownerId).get(repoId) ?? null,
      set: (repoId, state) => {
        ensure(ownerId).set(repoId, state);
      },
    }),
    listForOwner: (ownerId) => [...(byOwner.get(ownerId)?.values() ?? [])],
  };
}

/** Default read-only git provider (HEAD sha / branch) used by clone-backed services. */
function makeReadGitProvider(): Pick<GitProvider, 'headSha' | 'currentBranch'> {
  const run = (args: string[], cwd: string): Promise<string | null> =>
    new Promise((resolve) => {
      try {
        const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.on('error', () => resolve(null));
        child.on('close', (code) => resolve(code === 0 && stdout.trim() ? stdout.trim() : null));
      } catch {
        resolve(null);
      }
    });
  return {
    headSha: (repoRoot) => run(['rev-parse', 'HEAD'], repoRoot),
    currentBranch: (repoRoot) => run(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
  };
}

/** Lowercase + collapse to a single path-safe segment so workdirs can't escape. */
function sanitizeOwnerId(ownerId: string): string {
  const safe = ownerId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return safe.length > 0 ? safe : 'anon';
}

function makeDefaultServiceFactory(deps: CodeGraphUserRouterDeps): CodeGraphUserServiceFactory {
  const store = deps.store ?? createOwnerScopedIndexStore();
  const authenticatedClone = deps.authenticatedClone ?? createAuthenticatedClone();
  const workdirRoot = deps.workdirRoot ?? defaultWorkdirRoot;
  const read = makeReadGitProvider();

  return ({ ownerId, token }) => {
    const ownerSafe = sanitizeOwnerId(ownerId);
    const service = new RecoderGitService({
      isEnabled: deps.isEnabled,
      store: store.ownerView(ownerId),
      workdirRoot: () => path.join(workdirRoot(), ownerSafe),
      git: {
        headSha: read.headSha,
        currentBranch: read.currentBranch,
        // Per-request closure captures the token; the secure clone keeps it out
        // of argv/URL/logs (token flows to git via ENV/GIT_ASKPASS only).
        clone: (cloneUrl, dest, ref) => authenticatedClone({ cloneUrl, dest, ref, token }),
      },
    });
    return {
      connectRepo: (input) => service.connectRepo(input),
      status: (repoId) => service.status(repoId),
      domainMap: (repoId) => service.domainMap(repoId),
      listRepos: () => store.listForOwner(ownerId),
    };
  };
}

function toPublicRepo(state: IndexState): PublicRepo {
  return {
    repoId: state.repoId,
    status: state.status,
    nodes: state.nodes,
    edges: state.edges,
    branch: state.branch,
    indexedAt: state.indexedAt,
    cloneUrl: state.cloneUrl ?? null,
  };
}

function defaultResolveToken(req: OwnerScopedRequest): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const candidate = body.token ?? body.githubToken;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export function createCodeGraphUserRouter(deps: CodeGraphUserRouterDeps = {}): Router {
  const router = Router();
  const isEnabled = deps.isEnabled ?? isCodeGraphEnabled;
  const resolveToken = deps.resolveUserGithubToken ?? defaultResolveToken;
  const serviceFactory = deps.serviceFactory ?? makeDefaultServiceFactory(deps);

  const disabled = (res: Response) => res.json({ success: true, data: { enabled: false } });
  const ownerOf = (req: OwnerScopedRequest): string | null =>
    typeof req.userId === 'string' && req.userId.length > 0 ? req.userId : null;

  // Connect a GitHub repo on demand -> clone (securely) + index -> code graph.
  router.post('/connect', async (req: OwnerScopedRequest, res: Response) => {
    if (!isEnabled()) return disabled(res);
    const ownerId = ownerOf(req);
    if (!ownerId) {
      res.status(401).json({ success: false, error: 'authentication required' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const repoRaw = typeof body.repo === 'string' ? body.repo : typeof body.cloneUrl === 'string' ? body.cloneUrl : '';
    if (!repoRaw) {
      res.status(400).json({ success: false, error: 'repo ("owner/name" or cloneUrl) is required' });
      return;
    }

    let parsed;
    try {
      parsed = parseRepoInput(repoRaw);
    } catch (error) {
      res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'invalid repo' });
      return;
    }

    const ref = typeof body.ref === 'string' ? body.ref : undefined;
    const token = await resolveToken(req);
    const wantsPrivate = body.private === true || body.visibility === 'private';
    if (wantsPrivate && !token) {
      // No clone is attempted; surface a clear auth error with no token leak.
      res.status(401).json({ success: false, error: 'github authentication required for private repository' });
      return;
    }

    const service = serviceFactory({ ownerId, token });
    const result = await service.connectRepo({ repoId: parsed.repoId, cloneUrl: parsed.cloneUrl, ref });
    if (!result.enabled) return disabled(res);

    // Best-effort domain map; never blocks the connect response.
    let domainMap: DomainMap | undefined;
    try {
      const mapResult = await service.domainMap(parsed.repoId);
      if (mapResult.enabled) domainMap = mapResult.map;
    } catch {
      domainMap = undefined;
    }

    res.status(201).json({
      success: true,
      data: {
        enabled: true,
        repoId: result.state.repoId,
        status: result.status,
        nodes: result.state.nodes,
        edges: result.state.edges,
        branch: result.state.branch,
        indexedAt: result.state.indexedAt,
        ...(domainMap ? { domainMap } : {}),
      },
    });
  });

  // The requesting user's connected repos (owner-scoped).
  router.get('/repos', (req: OwnerScopedRequest, res: Response) => {
    if (!isEnabled()) return disabled(res);
    const ownerId = ownerOf(req);
    if (!ownerId) {
      res.status(401).json({ success: false, error: 'authentication required' });
      return;
    }
    const repos = serviceFactory({ ownerId, token: null }).listRepos().map(toPublicRepo);
    res.json({ success: true, data: { enabled: true, repos } });
  });

  // Truthful index status for one of the user's repos (owner-scoped).
  router.get('/:repoId/status', async (req: OwnerScopedRequest, res: Response) => {
    if (!isEnabled()) return disabled(res);
    const ownerId = ownerOf(req);
    if (!ownerId) {
      res.status(401).json({ success: false, error: 'authentication required' });
      return;
    }
    const result = await serviceFactory({ ownerId, token: null }).status(req.params.repoId);
    res.json({ success: true, data: result });
  });

  // Domain map for one of the user's repos (owner-scoped). Returns an empty map
  // without invoking the engine when the user has not connected this repo.
  router.get('/:repoId/domain-map', async (req: OwnerScopedRequest, res: Response) => {
    if (!isEnabled()) return disabled(res);
    const ownerId = ownerOf(req);
    if (!ownerId) {
      res.status(401).json({ success: false, error: 'authentication required' });
      return;
    }
    const repoId = req.params.repoId;
    const service = serviceFactory({ ownerId, token: null });

    // Scope guard: only run the engine for a repo the user actually connected.
    const statusResult = await service.status(repoId);
    if (!statusResult.enabled) return disabled(res);
    if (!statusResult.state) {
      const empty: DomainMap = { repoId, domains: [], crossEdges: [] };
      res.json({ success: true, data: { enabled: true, map: empty } });
      return;
    }

    const mapResult = await service.domainMap(repoId);
    res.json({ success: true, data: mapResult });
  });

  return router;
}

// Re-export for callers/tests that need the index-status union.
export type { IndexStatus };
