/**
 * RecoderGitService — flag-gated, fail-safe owner of the code-knowledge-graph
 * INDEXING LIFECYCLE for the vendored `recodergit` engine.
 *
 * The brain/agents query the engine (impact/query) via @recoder/brain, but those
 * queries are meaningless without a prior `analyze`. THIS service owns the other
 * half: building/refreshing the per-repo graph index, tracking truthful per-project
 * state (fresh vs stale vs not_indexed), and projecting the engine's groups/route
 * map into a Recoder DomainMap.
 *
 * SAFETY CONTRACT (binding — .claude/rules/production.md):
 * - ADDITIVE and FLAG-GATED. Default behavior is a pure no-op.
 * - Gate: RECODER_CODE_GRAPH_ENABLED (truthy = on, default OFF). When disabled,
 *   every method returns a disabled result and NO engine process is spawned.
 * - FAIL-SAFE. Engine absent / unbuilt / non-zero exit / parse failure degrades
 *   to a truthful 'unavailable' / 'not_indexed' / empty-map result. It NEVER throws
 *   into a request path, and NEVER claims fresh when stale.
 * - All IO (exec, git, clock, bin resolution, state store) is INJECTABLE so tests
 *   need no real clone, index, server, or network.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CODE_GRAPH_FLAG_ENV = 'RECODER_CODE_GRAPH_ENABLED';
const RECODERGIT_BIN_ENV = 'RECODERGIT_BIN';
const MCP_PORT_ENV = 'RECODER_CODE_GRAPH_MCP_PORT';
const DEFAULT_MCP_PORT = 7337;
const MCP_HOST = '127.0.0.1';
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

// Vendored engine entrypoint, relative to docker-backend/ (this file lives at
// docker-backend/src/agent-os/recodergit-service.ts -> ../../.. = repo root).
const VENDORED_BIN_RELATIVE = '../ts/recodergit/recodergit/dist/cli/index.js';

export type IndexStatus = 'indexed' | 'stale' | 'not_indexed' | 'unavailable';

export interface IndexState {
  repoId: string;
  repoRoot: string;
  branch: string | null;
  lastIndexedSha: string | null;
  indexedAt: string;
  nodes: number;
  edges: number;
  clusters?: number;
  flows?: number;
  status: Extract<IndexStatus, 'indexed' | 'unavailable'>;
  /** Set when the repo was cloned via connectRepo; null for on-disk indexRepo. */
  cloneUrl?: string | null;
}

export interface IndexRepoInput {
  repoRoot: string;
  repoId: string;
  /** Optional git ref to record/analyze. Informational; analyze uses the checkout. */
  ref?: string;
}

export interface ConnectRepoInput {
  /** Path-safe identifier (no '/', '\\', '..', or NUL). Used as the workdir name. */
  repoId: string;
  /** Remote URL to clone (https or git). Secrets/tokens come from the caller/env. */
  cloneUrl: string;
  /** Optional branch/ref to clone. Informational + passed to the cloner. */
  ref?: string;
}

export interface StatusResult {
  repoId: string;
  status: IndexStatus;
  /** True only when an index exists AND its sha matches current HEAD. Truthful. */
  fresh: boolean;
  state: IndexState | null;
  /** Current HEAD sha, when resolvable; null when git is unavailable. */
  currentSha: string | null;
}

export interface ReindexInput {
  repoId: string;
  changedFiles?: string[];
}

export interface DomainMapEntry {
  name: string;
  files?: string[];
  entryPoints?: string[];
  dependsOn?: string[];
}

export interface DomainMap {
  repoId: string;
  domains: DomainMapEntry[];
  crossEdges?: Array<{ from: string; to: string; kind?: string }>;
}

/**
 * Truthful supervision state of the `recodergit mcp --http` process.
 * - 'disabled'    : flag off — nothing is (or should be) running.
 * - 'starting'    : a spawn is in flight (transient).
 * - 'ready'       : a live child holds a pid and has not exited/errored.
 * - 'unavailable' : flag on but bin missing / spawn failed / process exited.
 */
export type ServerHealthStatus = 'disabled' | 'starting' | 'ready' | 'unavailable';

export interface ServerHealth {
  status: ServerHealthStatus;
  /** Streamable-HTTP base URL (POST <baseUrl>) when ready; null otherwise. */
  baseUrl: string | null;
  port: number | null;
  pid: number | null;
}

/**
 * Minimal, injectable handle over a spawned MCP server process. Lets tests
 * stand in a fake so NO real process is ever spawned.
 */
export interface ServerProcessHandle {
  pid: number | null;
  kill: () => void;
  onExit: (cb: (code: number | null) => void) => void;
  onError: (cb: (error: Error) => void) => void;
}

/** Spawns `node <bin> <...args>` as a long-lived server. Injected in tests. */
export type ServerSpawner = (bin: string, args: string[]) => ServerProcessHandle;

/** Result envelope: `{ enabled:false }` when the flag is off (no-op). */
export type DisabledResult = { enabled: false };
export type EnabledResult<T> = { enabled: true } & T;
export type ServiceResult<T> = DisabledResult | EnabledResult<T>;

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Runs the engine. `args` are the CLI args after the bin (e.g. ['analyze', root]). */
export type EngineExec = (args: string[], opts: { cwd: string }) => Promise<ExecResult>;

/** Resolves git facts without shelling out in tests. */
export interface GitProvider {
  headSha: (repoRoot: string) => Promise<string | null>;
  currentBranch: (repoRoot: string) => Promise<string | null>;
  /**
   * Clone `cloneUrl` into `dest` (optionally at `ref`). Optional so existing
   * injected providers stay valid; connectRepo degrades safely when absent.
   * Must reject on failure (non-zero exit / network error).
   */
  clone?: (cloneUrl: string, dest: string, ref?: string) => Promise<void>;
}

/** Injectable per-project index-state store. Default is in-memory; pg later. */
export interface IndexStateStore {
  get: (repoId: string) => Promise<IndexState | null> | IndexState | null;
  set: (repoId: string, state: IndexState) => Promise<void> | void;
}

export interface RecoderGitServiceLogger {
  error: (message: string, error: unknown) => void;
}

export interface RecoderGitServiceDeps {
  /** Reads the gate. Defaults to RECODER_CODE_GRAPH_ENABLED (truthy = on). */
  isEnabled?: () => boolean;
  /** Runs the engine. Injected in tests; defaults to a `node <bin>` spawn. */
  exec?: EngineExec;
  /** Resolves the engine bin path. Defaults to RECODERGIT_BIN or the vendored dist. */
  resolveBin?: () => string | null;
  /** Reads HEAD sha / branch. Injected in tests; defaults to `git` via exec. */
  git?: GitProvider;
  /** Per-project state store. Defaults to in-memory. */
  store?: IndexStateStore;
  /** Clock for indexedAt. Defaults to Date.now-based ISO string. */
  now?: () => string;
  /** Fail-safe error sink. Defaults to console.error. */
  logger?: RecoderGitServiceLogger;
  /**
   * Root dir for cloned repos (connectRepo). Each repo lands in
   * `<workdirRoot>/<repoId>`. Defaults to `<DATA_DIR>/code-graph`.
   */
  workdirRoot?: () => string;
  /**
   * Spawns the `recodergit mcp --http` server. Injected in tests so no real
   * process is spawned. Defaults to a `node <bin> mcp --http ...` spawn.
   */
  spawnServer?: ServerSpawner;
  /** Resolves the HTTP port for the MCP server. Defaults to env or 7337. */
  serverPort?: () => number;
}

function readFlagFromEnv(): boolean {
  const raw = process.env[CODE_GRAPH_FLAG_ENV]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}

/**
 * Reject repoIds that could escape the managed workdir. A safe repoId is a
 * single non-empty path segment with no separators, parent refs, or NUL bytes.
 * Throws on violation (callers catch and degrade — never propagate to a request).
 */
export function assertSafeRepoId(repoId: string): void {
  if (typeof repoId !== 'string' || repoId.length === 0) {
    throw new Error('unsafe repoId: must be a non-empty string');
  }
  if (
    repoId === '.' ||
    repoId === '..' ||
    repoId.includes('/') ||
    repoId.includes('\\') ||
    repoId.includes('\0') ||
    repoId.includes('..')
  ) {
    throw new Error(`unsafe repoId: ${JSON.stringify(repoId)}`);
  }
}

/**
 * Derive a deterministic, path-safe repoId from a GitHub `owner/repo` full name.
 * Lowercases and collapses every non `[a-z0-9_-]` run to `__` (so `owner/repo`
 * -> `owner__repo`), guaranteeing no separators or parent refs survive.
 */
export function repoIdFromFullName(fullName: string): string {
  return fullName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '__');
}

/** Default clone workdir root: `<DATA_DIR or cwd/data>/code-graph`. */
export function defaultWorkdirRoot(): string {
  const dataDir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'code-graph');
}

/** Default bin resolver: RECODERGIT_BIN override, else the vendored dist (if present). */
export function defaultResolveBin(): string | null {
  const override = process.env[RECODERGIT_BIN_ENV]?.trim();
  if (override) {
    return existsSync(override) ? override : null;
  }
  const vendored = path.resolve(__dirname, '..', '..', VENDORED_BIN_RELATIVE);
  return existsSync(vendored) ? vendored : null;
}

function spawnCapture(command: string, args: string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/** Default engine exec: `node <bin> <...args>`. Throws if the bin is absent. */
function makeDefaultExec(resolveBin: () => string | null): EngineExec {
  return async (args, opts) => {
    const bin = resolveBin();
    if (!bin) {
      throw new Error('recodergit engine bin not found (set RECODERGIT_BIN or build the vendored engine)');
    }
    return spawnCapture(process.execPath, [bin, ...args], opts.cwd);
  };
}

/** Default MCP HTTP port: RECODER_CODE_GRAPH_MCP_PORT override, else 7337. */
export function defaultServerPort(): number {
  const raw = process.env[MCP_PORT_ENV]?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return DEFAULT_MCP_PORT;
}

/**
 * Default server spawner: `node <bin> mcp --http --port <port> --host 127.0.0.1`
 * as a long-lived loopback Streamable-HTTP MCP server. Adapts the ChildProcess
 * into the injectable ServerProcessHandle so tests need no real process.
 */
function makeDefaultServerSpawner(): ServerSpawner {
  return (bin, args) => {
    const child = spawn(process.execPath, [bin, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    return {
      pid: child.pid ?? null,
      kill: () => {
        child.kill('SIGTERM');
      },
      onExit: (cb) => {
        child.on('exit', (code) => cb(code));
      },
      onError: (cb) => {
        child.on('error', (error) => cb(error));
      },
    };
  };
}

/** Default git provider: shells `git` via the injected engine-less spawn. */
function makeDefaultGit(): GitProvider {
  const run = async (args: string[], cwd: string): Promise<string | null> => {
    try {
      const result = await spawnCapture('git', args, cwd);
      if (result.code !== 0) return null;
      const value = result.stdout.trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  };
  return {
    headSha: (repoRoot) => run(['rev-parse', 'HEAD'], repoRoot),
    currentBranch: (repoRoot) => run(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    clone: async (cloneUrl, dest, ref) => {
      mkdirSync(path.dirname(dest), { recursive: true });
      const args = ['clone', '--depth', '1'];
      if (ref) {
        args.push('--branch', ref);
      }
      args.push(cloneUrl, dest);
      const result = await spawnCapture('git', args, path.dirname(dest));
      if (result.code !== 0) {
        throw new Error(`git clone failed (${result.code}): ${result.stderr.trim().slice(0, 200)}`);
      }
    },
  };
}

class InMemoryIndexStateStore implements IndexStateStore {
  private readonly states = new Map<string, IndexState>();
  get(repoId: string): IndexState | null {
    return this.states.get(repoId) ?? null;
  }
  set(repoId: string, state: IndexState): void {
    this.states.set(repoId, state);
  }
}

/** Parse "N nodes | M edges | C clusters | F flows" from analyze stdout. */
export function parseAnalyzeStats(stdout: string): {
  nodes: number;
  edges: number;
  clusters?: number;
  flows?: number;
} {
  const pick = (label: string): number | undefined => {
    const match = stdout.match(new RegExp(`([\\d,]+)\\s+${label}`, 'i'));
    if (!match) return undefined;
    const value = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    nodes: pick('nodes') ?? 0,
    edges: pick('edges') ?? 0,
    clusters: pick('clusters'),
    flows: pick('flows'),
  };
}

/** Project arbitrary engine group/route-map JSON into a Recoder DomainMap. */
export function projectDomainMap(repoId: string, raw: unknown): DomainMap {
  const empty: DomainMap = { repoId, domains: [], crossEdges: [] };
  if (!raw || typeof raw !== 'object') return empty;

  const obj = raw as Record<string, unknown>;
  const rawGroups = Array.isArray(obj.domains)
    ? obj.domains
    : Array.isArray(obj.groups)
      ? obj.groups
      : Array.isArray(raw)
        ? (raw as unknown[])
        : [];

  const domains: DomainMapEntry[] = [];
  for (const entry of rawGroups) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : typeof e.id === 'string' ? e.id : undefined;
    if (!name) continue;
    domains.push({
      name,
      files: toStringArray(e.files),
      entryPoints: toStringArray(e.entryPoints ?? e.entrypoints ?? e.entry_points),
      dependsOn: toStringArray(e.dependsOn ?? e.depends_on ?? e.dependencies),
    });
  }

  const rawEdges = Array.isArray(obj.crossEdges)
    ? obj.crossEdges
    : Array.isArray(obj.edges)
      ? obj.edges
      : [];
  const crossEdges: Array<{ from: string; to: string; kind?: string }> = [];
  for (const edge of rawEdges) {
    if (!edge || typeof edge !== 'object') continue;
    const ed = edge as Record<string, unknown>;
    if (typeof ed.from !== 'string' || typeof ed.to !== 'string') continue;
    const mapped: { from: string; to: string; kind?: string } = { from: ed.from, to: ed.to };
    if (typeof ed.kind === 'string') mapped.kind = ed.kind;
    crossEdges.push(mapped);
  }

  return { repoId, domains, crossEdges };
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((item): item is string => typeof item === 'string');
  return arr.length > 0 ? arr : undefined;
}

export class RecoderGitService {
  private readonly isEnabledFn: () => boolean;
  private readonly exec: EngineExec;
  private readonly git: GitProvider;
  private readonly store: IndexStateStore;
  private readonly now: () => string;
  private readonly logger: RecoderGitServiceLogger;
  private readonly workdirRoot: () => string;
  private readonly resolveBin: () => string | null;
  private readonly spawnServer: ServerSpawner;
  private readonly serverPortFn: () => number;

  // Supervision state for the `recodergit mcp --http` process. Mutated only by
  // ensureServer()/stopServer() and the child's exit/error callbacks.
  private serverHandle: ServerProcessHandle | null = null;
  private serverStatus: Exclude<ServerHealthStatus, 'disabled'> = 'unavailable';
  private serverPortValue: number | null = null;

  constructor(deps: RecoderGitServiceDeps = {}) {
    this.isEnabledFn = deps.isEnabled ?? readFlagFromEnv;
    this.resolveBin = deps.resolveBin ?? defaultResolveBin;
    this.exec = deps.exec ?? makeDefaultExec(this.resolveBin);
    this.git = deps.git ?? makeDefaultGit();
    this.store = deps.store ?? new InMemoryIndexStateStore();
    this.now = deps.now ?? (() => new Date().toISOString());
    this.logger = deps.logger ?? { error: (message, error) => console.error(message, error) };
    this.workdirRoot = deps.workdirRoot ?? defaultWorkdirRoot;
    this.spawnServer = deps.spawnServer ?? makeDefaultServerSpawner();
    this.serverPortFn = deps.serverPort ?? defaultServerPort;
  }

  /** True when the gate env var is truthy. Default OFF. */
  isEnabled(): boolean {
    return this.isEnabledFn();
  }

  /**
   * Bring up (or confirm) the supervised `recodergit mcp --http` server and
   * return its truthful health. Idempotent — a live child is NOT re-spawned.
   *
   * Fail-safe: flag off -> 'disabled' (no spawn); bin missing or spawn failure
   * -> 'unavailable' (logged, never thrown). This NEVER throws into a request
   * path and NEVER claims 'ready' without a live pid.
   */
  async ensureServer(): Promise<ServerHealth> {
    if (!this.isEnabled()) {
      return this.healthSnapshot('disabled');
    }

    // Idempotent: a live, ready child is reused — do not double-spawn.
    if (this.serverHandle && this.serverStatus === 'ready') {
      return this.healthSnapshot();
    }

    const bin = this.resolveBin();
    if (!bin) {
      this.serverHandle = null;
      this.serverStatus = 'unavailable';
      this.logger.error(
        '[recodergit-service] ensureServer: engine bin not found (set RECODERGIT_BIN or build the vendored engine)',
        null,
      );
      return this.healthSnapshot();
    }

    const port = this.serverPortFn();
    this.serverStatus = 'starting';
    try {
      const handle = this.spawnServer(bin, [
        'mcp',
        '--http',
        '--port',
        String(port),
        '--host',
        MCP_HOST,
      ]);
      if (!handle || handle.pid === null || handle.pid === undefined) {
        this.serverHandle = null;
        this.serverStatus = 'unavailable';
        this.logger.error('[recodergit-service] ensureServer: spawn returned no pid (degrading to unavailable)', null);
        return this.healthSnapshot();
      }

      handle.onExit((code) => {
        // Only react if this is still the tracked child.
        if (this.serverHandle === handle) {
          this.serverHandle = null;
          this.serverStatus = 'unavailable';
          this.logger.error(`[recodergit-service] mcp server exited (code=${code ?? 'null'})`, null);
        }
      });
      handle.onError((error) => {
        if (this.serverHandle === handle) {
          this.serverHandle = null;
          this.serverStatus = 'unavailable';
        }
        this.logger.error('[recodergit-service] mcp server process error', error);
      });

      this.serverHandle = handle;
      this.serverPortValue = port;
      this.serverStatus = 'ready';
      return this.healthSnapshot();
    } catch (error: unknown) {
      this.serverHandle = null;
      this.serverStatus = 'unavailable';
      this.logger.error('[recodergit-service] ensureServer spawn failed (degrading to unavailable)', error);
      return this.healthSnapshot();
    }
  }

  /** Current truthful server health WITHOUT spawning. 'disabled' when flag off. */
  serverHealth(): ServerHealth {
    if (!this.isEnabled()) {
      return this.healthSnapshot('disabled');
    }
    return this.healthSnapshot();
  }

  /** Kill the supervised server (if any). Idempotent; never throws. */
  stopServer(): void {
    const handle = this.serverHandle;
    this.serverHandle = null;
    this.serverStatus = 'unavailable';
    if (handle) {
      try {
        handle.kill();
      } catch (error: unknown) {
        this.logger.error('[recodergit-service] stopServer kill failed', error);
      }
    }
  }

  private healthSnapshot(override?: ServerHealthStatus): ServerHealth {
    const status = override ?? this.serverStatus;
    const ready = status === 'ready' && this.serverHandle !== null;
    const port = ready ? this.serverPortValue : null;
    return {
      status,
      baseUrl: ready && port !== null ? `http://${MCP_HOST}:${port}/mcp` : null,
      port,
      pid: ready ? this.serverHandle?.pid ?? null : null,
    };
  }

  /**
   * Build (or rebuild) the per-repo graph via `analyze`, record node/edge counts
   * and HEAD sha into the state store. Fail-safe -> status:'unavailable' (logged,
   * never thrown). No-op when the flag is off.
   */
  async indexRepo(input: IndexRepoInput): Promise<ServiceResult<{ state: IndexState }>> {
    if (!this.isEnabled()) return { enabled: false };

    const { repoRoot, repoId } = input;
    try {
      const result = await this.exec(['analyze', repoRoot, '--skip-git'], { cwd: repoRoot });
      if (result.code !== 0) {
        throw new Error(`analyze exited with code ${result.code}: ${result.stderr.trim().slice(0, 200)}`);
      }
      const stats = parseAnalyzeStats(result.stdout);
      const [lastIndexedSha, branch] = await Promise.all([
        this.git.headSha(repoRoot),
        this.git.currentBranch(repoRoot),
      ]);
      const state: IndexState = {
        repoId,
        repoRoot,
        branch,
        lastIndexedSha,
        indexedAt: this.now(),
        nodes: stats.nodes,
        edges: stats.edges,
        clusters: stats.clusters,
        flows: stats.flows,
        status: 'indexed',
      };
      await this.store.set(repoId, state);
      return { enabled: true, state };
    } catch (error: unknown) {
      this.logger.error('[recodergit-service] indexRepo failed (degrading to unavailable)', error);
      const state: IndexState = {
        repoId,
        repoRoot,
        branch: null,
        lastIndexedSha: null,
        indexedAt: this.now(),
        nodes: 0,
        edges: 0,
        status: 'unavailable',
      };
      await this.store.set(repoId, state);
      return { enabled: true, state };
    }
  }

  /**
   * Connect a remote repo to the code-graph: clone it into a path-safe managed
   * workdir (`<workdirRoot>/<repoId>`), then `indexRepo` it and persist the
   * IndexState (with `repoRoot` + `cloneUrl`). No-op when the flag is off.
   * Unsafe repoId, missing cloner, or clone/index failure all degrade to a
   * truthful 'unavailable' state — this NEVER throws into a request path.
   */
  async connectRepo(
    input: ConnectRepoInput,
  ): Promise<ServiceResult<{ state: IndexState; status: IndexStatus }>> {
    if (!this.isEnabled()) return { enabled: false };

    const { repoId, cloneUrl, ref } = input;

    let repoRoot: string;
    try {
      assertSafeRepoId(repoId);
      repoRoot = path.join(this.workdirRoot(), repoId);
    } catch (error: unknown) {
      // Reject path-traversal repoIds WITHOUT cloning, persisting, or spawning.
      this.logger.error('[recodergit-service] connectRepo rejected unsafe repoId', error);
      return { enabled: true, state: this.unavailableState(repoId, '', cloneUrl), status: 'unavailable' };
    }

    try {
      if (!this.git.clone) {
        throw new Error('git provider has no clone capability');
      }
      await this.git.clone(cloneUrl, repoRoot, ref);
      const indexed = await this.indexRepo({ repoRoot, repoId, ref });
      if (!indexed.enabled) {
        // isEnabled() was true above; defensive only.
        const state = this.unavailableState(repoId, repoRoot, cloneUrl);
        await this.store.set(repoId, state);
        return { enabled: true, state, status: 'unavailable' };
      }
      // Record the cloneUrl alongside the freshly-indexed state (immutable copy).
      const state: IndexState = { ...indexed.state, cloneUrl: cloneUrl ?? null };
      await this.store.set(repoId, state);
      return { enabled: true, state, status: state.status };
    } catch (error: unknown) {
      this.logger.error('[recodergit-service] connectRepo clone/index failed (degrading to unavailable)', error);
      const state = this.unavailableState(repoId, repoRoot, cloneUrl);
      await this.store.set(repoId, state);
      return { enabled: true, state, status: 'unavailable' };
    }
  }

  private unavailableState(repoId: string, repoRoot: string, cloneUrl?: string): IndexState {
    return {
      repoId,
      repoRoot,
      branch: null,
      lastIndexedSha: null,
      indexedAt: this.now(),
      nodes: 0,
      edges: 0,
      status: 'unavailable',
      cloneUrl: cloneUrl ?? null,
    };
  }

  /**
   * Report truthful index status: 'not_indexed' when no state, 'stale' when the
   * recorded sha differs from current HEAD, 'indexed' (fresh) only when they match.
   * Never claims fresh when stale; degrades safely if git is unavailable.
   */
  async status(repoId: string): Promise<ServiceResult<StatusResult>> {
    if (!this.isEnabled()) return { enabled: false };

    const state = await this.store.get(repoId);
    if (!state) {
      return { enabled: true, repoId, status: 'not_indexed', fresh: false, state: null, currentSha: null };
    }
    if (state.status === 'unavailable') {
      return { enabled: true, repoId, status: 'unavailable', fresh: false, state, currentSha: null };
    }

    let currentSha: string | null = null;
    try {
      currentSha = await this.git.headSha(state.repoRoot);
    } catch (error: unknown) {
      this.logger.error('[recodergit-service] status headSha failed (treating as unknown)', error);
      currentSha = null;
    }

    // Truthful staleness: only "fresh" when we can confirm shas match.
    const fresh = currentSha !== null && state.lastIndexedSha !== null && currentSha === state.lastIndexedSha;
    const status: IndexStatus = fresh ? 'indexed' : 'stale';
    return { enabled: true, repoId, status, fresh, state, currentSha };
  }

  /**
   * Incremental refresh on push: `detect-changes` then a best-effort `analyze`.
   * Updates state on success. Fail-safe -> unavailable. No-op when flag off; returns
   * not_indexed status when there is no prior index to refresh.
   */
  async reindexOnPush(input: ReindexInput): Promise<ServiceResult<{ state: IndexState | null; status: IndexStatus }>> {
    if (!this.isEnabled()) return { enabled: false };

    const existing = await this.store.get(input.repoId);
    if (!existing) {
      return { enabled: true, state: null, status: 'not_indexed' };
    }

    try {
      // Best-effort delta detection; ignored on failure, analyze still runs.
      await this.exec(['detect-changes'], { cwd: existing.repoRoot }).catch(() => undefined);
      const reindexed = await this.indexRepo({ repoRoot: existing.repoRoot, repoId: input.repoId });
      if (reindexed.enabled) {
        return { enabled: true, state: reindexed.state, status: reindexed.state.status };
      }
      return { enabled: true, state: existing, status: existing.status };
    } catch (error: unknown) {
      this.logger.error('[recodergit-service] reindexOnPush failed (degrading to unavailable)', error);
      return { enabled: true, state: existing, status: 'unavailable' };
    }
  }

  /**
   * Project the engine's groups / route-map into a Recoder DomainMap.
   * Fail-safe -> empty map when the engine is unavailable, errors, or emits no JSON.
   */
  async domainMap(repoId: string): Promise<ServiceResult<{ map: DomainMap }>> {
    if (!this.isEnabled()) return { enabled: false };

    const emptyMap: DomainMap = { repoId, domains: [], crossEdges: [] };
    const state = await this.store.get(repoId);
    const cwd = state?.repoRoot ?? process.cwd();

    try {
      const result = await this.exec(['route-map', '--json'], { cwd });
      if (result.code !== 0) {
        return { enabled: true, map: emptyMap };
      }
      const parsed = extractJson(result.stdout);
      if (parsed === undefined) {
        return { enabled: true, map: emptyMap };
      }
      return { enabled: true, map: projectDomainMap(repoId, parsed) };
    } catch (error: unknown) {
      this.logger.error('[recodergit-service] domainMap failed (degrading to empty map)', error);
      return { enabled: true, map: emptyMap };
    }
  }
}

/**
 * Extract the JSON payload from engine stdout. The engine writes pino logs to
 * STDERR, so stdout is normally clean JSON — but we still scan for the first
 * `{`/`[` to tolerate any stray banner line. Returns undefined on parse failure.
 */
export function extractJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  const candidates = [trimmed];
  const braceIdx = trimmed.indexOf('{');
  const bracketIdx = trimmed.indexOf('[');
  const start = [braceIdx, bracketIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start !== undefined && start > 0) {
    candidates.push(trimmed.slice(start));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

export function createRecoderGitService(deps?: RecoderGitServiceDeps): RecoderGitService {
  return new RecoderGitService(deps);
}
