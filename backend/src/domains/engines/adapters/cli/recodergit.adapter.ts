/**
 * `RecodergitAdapter` — the `EngineClientPort` over the vendored `recodergit`
 * code-knowledge-graph engine. It REUSES `agent-os/recodergit-service.ts`
 * (`RecoderGitService`), which already owns the flag-gated, fail-safe indexing
 * lifecycle: in-process `runFullAnalysis` first (typed stats), CLI-spawn fallback,
 * a supervised `recodergit mcp --http` loopback server, and truthful per-repo
 * freshness (indexed / stale / not_indexed / unavailable).
 *
 * `invoke` maps ops onto that service: `index` (build/refresh a repo graph),
 * `connect` (clone + index a remote), `status` (truthful freshness), `reindex`
 * (incremental on push), `domain-map` (project groups/routes into a DomainMap),
 * and `ensure-server` / `server-health` (the loopback MCP server). The seam owns
 * this raw engine transport (conflict #8); the retrieval / code-graph capability
 * domains consume the typed client.
 *
 * DEGRADE-SAFE LAW: gate `RECODER_CODE_GRAPH_ENABLED` off ⇒ `health()` is a
 * truthful `down` ("disabled") and every `invoke` returns the service's
 * `{ enabled:false }` as a truthful `{ ok:false }`. Engine absent/unbuilt ⇒
 * `unavailable` — never a fabricated index.
 */
import {
  createRecoderGitService,
  type RecoderGitService,
  type RecoderGitServiceDeps,
  type CodeIntelOp,
  type CodeIntelParams,
} from '../../recodergit-service.js';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled } from '../../config.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall } from '../../ports/engine-client.port.js';
import {
  down,
  fail,
  ok,
  up,
  type EngineHealth,
  type InvokeResult,
} from '../../types.js';

/** The code-graph ops the adapter maps onto the RecoderGitService. */
export type RecodergitOp =
  | 'index'
  | 'connect'
  | 'status'
  | 'reindex'
  | 'domain-map'
  | 'ensure-server'
  | 'server-health'
  // Read-only code-intel queries over an indexed repo graph (in-proc callTool).
  | 'symbol-search'
  | 'find-references'
  | 'call-graph'
  | 'definition';

/** The code-intel adapter ops → the service's {@link CodeIntelOp}. */
const CODE_INTEL_OPS: Readonly<Record<string, CodeIntelOp>> = {
  'symbol-search': 'symbol_search',
  'find-references': 'find_references',
  'call-graph': 'call_graph',
  definition: 'definition',
};

export interface RecodergitAdapterDeps {
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Inject a pre-built service (defaults to a fresh `createRecoderGitService`). */
  readonly service?: RecoderGitService;
  /** Override the service construction deps (test seams: no real clone/index). */
  readonly serviceDeps?: RecoderGitServiceDeps;
}

export class RecodergitAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: RecodergitAdapterDeps;
  private readonly service: RecoderGitService;

  constructor(deps: RecodergitAdapterDeps) {
    super('recodergit', 'cli');
    this.deps = deps;
    this.service = deps.service ?? createRecoderGitService(deps.serviceDeps);
  }

  override async stop(): Promise<void> {
    try {
      this.service.stopServer();
    } catch {
      // idempotent, degrade-safe
    }
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'recodergit')) {
      return fail('recodergit engine disabled by config', 'disabled');
    }
    if (!this.service.isEnabled()) {
      return fail(
        'recodergit code-graph disabled (set RECODER_CODE_GRAPH_ENABLED)',
        'disabled'
      );
    }
    const op = call.op as RecodergitOp;
    const input = (call.input ?? {}) as Record<string, unknown>;
    try {
      switch (op) {
        case 'index': {
          const repoRoot = str(input.repoRoot);
          const repoId = str(input.repoId);
          if (!repoRoot || !repoId)
            return fail(
              'recodergit index requires repoRoot + repoId',
              'bad_input'
            );
          const res = await this.service.indexRepo({
            repoRoot,
            repoId,
            ...(str(input.ref) ? { ref: str(input.ref) as string } : {}),
          });
          return res.enabled
            ? ok(res.state)
            : fail('recodergit disabled', 'disabled');
        }
        case 'connect': {
          const repoId = str(input.repoId);
          const cloneUrl = str(input.cloneUrl);
          if (!repoId || !cloneUrl)
            return fail(
              'recodergit connect requires repoId + cloneUrl',
              'bad_input'
            );
          const res = await this.service.connectRepo({
            repoId,
            cloneUrl,
            ...(str(input.ref) ? { ref: str(input.ref) as string } : {}),
          });
          return res.enabled
            ? ok({ state: res.state, status: res.status })
            : fail('recodergit disabled', 'disabled');
        }
        case 'status': {
          const repoId = str(input.repoId);
          if (!repoId)
            return fail('recodergit status requires repoId', 'bad_input');
          const res = await this.service.status(repoId);
          return res.enabled
            ? ok(res)
            : fail('recodergit disabled', 'disabled');
        }
        case 'reindex': {
          const repoId = str(input.repoId);
          if (!repoId)
            return fail('recodergit reindex requires repoId', 'bad_input');
          const res = await this.service.reindexOnPush({ repoId });
          return res.enabled
            ? ok({ state: res.state, status: res.status })
            : fail('recodergit disabled', 'disabled');
        }
        case 'domain-map': {
          const repoId = str(input.repoId);
          if (!repoId)
            return fail('recodergit domain-map requires repoId', 'bad_input');
          const res = await this.service.domainMap(repoId);
          return res.enabled
            ? ok(res.map)
            : fail('recodergit disabled', 'disabled');
        }
        case 'ensure-server':
          return ok(await this.service.ensureServer());
        case 'server-health':
          return ok(this.service.serverHealth());
        case 'symbol-search':
        case 'find-references':
        case 'call-graph':
        case 'definition': {
          const repoId = str(input.repoId);
          if (!repoId)
            return fail(`recodergit ${op} requires repoId`, 'bad_input');
          const res = await this.service.codeIntel(
            CODE_INTEL_OPS[op],
            repoId,
            toCodeIntelParams(input)
          );
          if (!res.enabled) return fail('recodergit disabled', 'disabled');
          const { enabled, ...payload } = res;
          return enabled ? ok(payload) : fail('recodergit disabled', 'disabled');
        }
        default:
          return fail(`unknown recodergit op '${call.op}'`, 'bad_op');
      }
    } catch (err) {
      return fail(`recodergit ${op} failed: ${message(err)}`);
    }
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'recodergit')) {
      return down('recodergit', 'cli', 'recodergit engine disabled by config');
    }
    if (!this.service.isEnabled()) {
      return down(
        'recodergit',
        'cli',
        'recodergit code-graph disabled (set RECODER_CODE_GRAPH_ENABLED)'
      );
    }
    const server = this.service.serverHealth();
    if (server.status === 'ready') {
      return up('recodergit', 'cli', {
        ...(server.baseUrl ? { bindingPath: server.baseUrl } : {}),
      });
    }
    if (server.status === 'starting') {
      return {
        engineId: 'recodergit',
        transport: 'cli',
        status: 'degraded',
        reason: 'recodergit mcp server starting',
        checkedAt: new Date().toISOString(),
      };
    }
    // Enabled but the loopback MCP server is not up. The engine can still index
    // in-process/CLI, so this is a truthful "server unavailable" rather than a
    // hard down of the whole engine — but health reports the server truth.
    return down(
      'recodergit',
      'cli',
      server.status === 'disabled'
        ? 'recodergit disabled'
        : 'recodergit mcp server unavailable (bin missing/unbuilt)'
    );
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Project the raw MCP-tool args bag onto the service's {@link CodeIntelParams}. */
function toCodeIntelParams(input: Record<string, unknown>): CodeIntelParams {
  const params: CodeIntelParams = {};
  const assign = <K extends keyof CodeIntelParams>(
    key: K,
    value: CodeIntelParams[K]
  ): void => {
    if (value !== undefined) params[key] = value;
  };
  assign('repo', str(input.repo));
  assign('query', str(input.query));
  assign('symbol', str(input.symbol));
  assign('uid', str(input.uid));
  assign('filePath', str(input.filePath));
  assign('kind', str(input.kind));
  assign('limit', num(input.limit));
  assign('maxSymbols', num(input.maxSymbols));
  assign('maxDepth', num(input.maxDepth));
  assign('includeContent', bool(input.includeContent));
  return params;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
