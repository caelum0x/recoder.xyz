/**
 * `BeadsAdapter` — the `EngineClientPort` over the `bd` (beads) issue-graph CLI,
 * the cross-agent shared-memory fabric (AGENTS.md: "beads IS the memory layer").
 * It REUSES `conductor/beads-bin.ts`'s owned-binary resolver (BEADS_BIN → vendored
 * build → PATH) so the seam shells to the SAME `bd` the conductor drives — never a
 * random PATH binary.
 *
 * `invoke` maps ops onto real `bd` subcommands (`ready`, `show`, `create`,
 * `update`, `close`, `claim`, `note`, `search`, `vc status`) plus the DEEPER
 * issue-graph reads (`blocked`, `dep tree`, `dep list`, `count`), the memory
 * verbs (`remember` = ephemeral wisp create, `recall_memory`, `promote`), the
 * durability ops (`flush` = `vc commit`, `gc`) and the board read (`stale`) —
 * all through the bounded, degrade-safe `runCli` primitive; the issue graph is
 * the raw transport the seam owns (conflict #8). {@link buildBeadsArgs} is the
 * ONLY place in `backend/src` a `bd` argv is constructed; every write op takes
 * an optional `actor` that becomes bd's global `--actor` audit-trail flag.
 * The exported binder passes THIS adapter into `registerBeadsMcpTools` so the
 * full `beads.*` agent-callable surface delegates onto the one spawner behind
 * the interop gate; the graph-query reads are exposed as a SECOND server via
 * `buildBeadsGraphMcpTools` over this same adapter seam.
 *
 * DEGRADE-SAFE LAW: `bd` not resolvable ⇒ `health()` is a truthful `down` and
 * every `invoke` returns `{ ok:false, reason }`. Never fabricates issue data.
 */
import { registerBeadsMcpTools } from '../../beads-engine.js';
import { resolveBeadsBin } from '../../beads-bin.js';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { Logger } from '../../../../shared/logger.js';
import type { EnginesConfig } from '../../config.js';
import { isEngineEnabled } from '../../config.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import type { EngineCall, EngineClientPort } from '../../ports/engine-client.port.js';
import { down, fail, ok, up, type EngineHealth, type InvokeResult } from '../../types.js';
import { parseCliJson, runCli } from './cli-exec.js';

/** The issue-graph ops the adapter maps onto `bd` subcommands. */
export type BeadsOp =
  | 'ready'
  | 'show'
  | 'create'
  | 'update'
  | 'close'
  | 'claim'
  | 'note'
  | 'search'
  | 'sync'
  // Deeper issue-graph reads (the `beads-graph` MCP server binds these):
  | 'blocked' // `bd blocked` — issues with open blockers + their blocked-by ids
  | 'graph' //   `bd dep tree` — the dependency tree rooted at an issue
  | 'deps' //    `bd dep list` — the flat dependency/dependent records for an issue
  | 'stats' //   `bd count`    — issue counts, optionally grouped by an attribute
  | 'stale' //   `bd stale`    — in-flight issues with no recent activity (board read)
  // Memory verbs (bd IS the memory layer — the wisp→promote candidate lifecycle):
  | 'remember' //      `bd create --ephemeral -l memory` — an EPHEMERAL memory candidate
  | 'recall_memory' // `bd search --label memory --status all` — candidates + promoted
  | 'promote' //       `bd promote` — the REVIEW step (governed memory-lifecycle only)
  // Durability (Dolt version control):
  | 'flush' // `bd vc commit -m …` — seal the working set as a versioned checkpoint
  | 'gc' //    `bd gc --force`    — decay closed/expired wisps + compact + Dolt GC
  | 'raw';

/** Dependency-tree directions accepted by `bd dep tree`. */
const GRAPH_DIRECTIONS = new Set(['down', 'up', 'both']);
/** Dependency-list directions accepted by `bd dep list`. */
const DEPS_DIRECTIONS = new Set(['down', 'up']);
/** `bd count --by-*` group attributes → the concrete flag. */
const STATS_GROUP_FLAGS: Readonly<Record<string, string>> = {
  status: '--by-status',
  priority: '--by-priority',
  type: '--by-type',
  assignee: '--by-assignee',
  label: '--by-label',
};

export interface BeadsAdapterDeps {
  readonly config: EnginesConfig;
  readonly log: Logger;
  /** Resolve the `bd` binary (defaults to the conductor owned-binary resolver). */
  readonly resolveBin?: () => string | undefined;
  /** The repo the issue graph lives in (defaults to config.repoRoot / cwd). */
  readonly cwd?: string;
}

export class BeadsAdapter extends EngineClientBase<unknown, unknown> {
  private readonly deps: BeadsAdapterDeps;
  private readonly resolveBin: () => string | undefined;
  private readonly cwd: string;

  constructor(deps: BeadsAdapterDeps) {
    super('beads', 'cli');
    this.deps = deps;
    this.resolveBin = deps.resolveBin ?? (() => resolveBeadsBin());
    this.cwd = deps.cwd ?? deps.config.repoRoot ?? process.cwd();
  }

  async invoke(call: EngineCall<unknown>): Promise<InvokeResult<unknown>> {
    if (!isEngineEnabled(this.deps.config, 'beads')) {
      return fail('beads engine disabled by config', 'disabled');
    }
    const bin = this.resolveBin();
    if (!bin) return fail('bd (beads) binary not found (set BEADS_BIN or build the vendored engine)', 'unavailable');

    const op = call.op as BeadsOp;
    const input = (call.input ?? {}) as Record<string, unknown>;
    const args = buildBeadsArgs(op, input);
    if (!args) return fail(`invalid beads op '${call.op}' or missing required arg`, 'bad_input');

    const result = await runCli(bin, args, { cwd: this.cwd, timeoutMs: call.timeoutMs ?? 20_000 });
    if (!result.ok) {
      const reason = /ENOENT|not found/i.test(result.reason ?? '')
        ? 'bd (beads) is not installed on this host'
        : result.reason ?? 'bd failed';
      return fail(reason, 'cli_error');
    }
    return ok(parseCliJson(result.stdout));
  }

  async health(): Promise<EngineHealth> {
    if (!isEngineEnabled(this.deps.config, 'beads')) {
      return down('beads', 'cli', 'beads engine disabled by config');
    }
    const bin = this.resolveBin();
    if (!bin) return down('beads', 'cli', 'bd binary not found (set BEADS_BIN or build the vendored engine)');
    const result = await runCli(bin, ['version'], { cwd: this.cwd, timeoutMs: 5_000 });
    if (result.ok) {
      return up('beads', 'cli', { bindingPath: bin, version: result.stdout.trim().split('\n')[0]?.slice(0, 40) });
    }
    // `version` unknown on some builds — a `--help` exit still proves the bin runs.
    const help = await runCli(bin, ['--help'], { cwd: this.cwd, timeoutMs: 5_000 });
    if (help.ok) return up('beads', 'cli', { bindingPath: bin });
    return down('beads', 'cli', result.reason ?? 'bd did not respond to version/--help', { bindingPath: bin });
  }

}

/**
 * Translate an op + input into a concrete `bd` argv (null → invalid). The ONE
 * place in `backend/src` a `bd` command line is constructed (single argv owner
 * — the MCP tools and the memory facet all delegate here through `invoke`).
 * Write ops append the bd global `--actor` flag when `input.actor` is present,
 * turning the audit/interactions trail from anonymous into attributable.
 */
export function buildBeadsArgs(op: BeadsOp, input: Record<string, unknown>): string[] | null {
  const id = str(input.id) ?? str(input.issueId);
  switch (op) {
    case 'ready':
      return ['ready', '--json'];
    case 'sync':
      return ['vc', 'status'];
    case 'show': {
      if (!id) return null;
      // `--long` surfaces the extended fields (accumulated `comments` = NOTE
      // evidence and the full `dependencies` lineage) that a bare `show` omits
      // — the shared-memory context a launcher weaves into an agent prompt.
      return input.long === true ? ['show', id, '--long', '--json'] : ['show', id, '--json'];
    }
    case 'claim':
      return id ? withActor(['update', id, '--claim', '--json'], input) : null;
    case 'create': {
      const title = str(input.title);
      if (!title) return null;
      const args = ['create', title, '--json'];
      const description = str(input.description ?? input.body);
      if (description) args.push('-d', description);
      const discoveredFrom = str(input.discoveredFrom);
      if (discoveredFrom) args.push('--deps', `discovered-from:${discoveredFrom}`);
      const labels = str(input.labels);
      if (labels) args.push('-l', labels);
      return withActor(args, input);
    }
    case 'update': {
      if (!id) return null;
      const args = ['update', id, '--json'];
      const status = str(input.status);
      if (status) args.push('--status', status);
      return withActor(args, input);
    }
    case 'close': {
      if (!id) return null;
      const args = ['close', id, '--json'];
      const reason = str(input.reason);
      if (reason) args.push('--reason', reason);
      return withActor(args, input);
    }
    case 'note': {
      const text = str(input.text ?? input.note);
      if (!id || !text) return null;
      return withActor(['note', id, text, '--json'], input);
    }
    case 'search': {
      const query = str(input.query);
      if (!query) return null;
      const args = ['search', query, '--json'];
      const label = str(input.label);
      if (label) args.push('--label', label);
      const status = str(input.status);
      if (status) args.push('--status', status);
      const limit = Number(input.limit);
      if (Number.isFinite(limit) && limit > 0) args.push('-n', String(Math.min(limit, 50)));
      return args;
    }
    case 'blocked': {
      const args = ['blocked', '--json'];
      const parent = str(input.parent) ?? str(input.parentId);
      if (parent) args.push('--parent', parent);
      return args;
    }
    case 'graph': {
      if (!id) return null;
      const args = ['dep', 'tree', id, '--json'];
      const direction = str(input.direction);
      if (direction && GRAPH_DIRECTIONS.has(direction)) args.push('--direction', direction);
      else if (direction) return null; // an unknown direction is bad input, not a silent default
      const maxDepth = Number(input.maxDepth);
      if (Number.isFinite(maxDepth) && maxDepth >= 1) args.push('--max-depth', String(Math.trunc(maxDepth)));
      const status = str(input.status);
      if (status) args.push('--status', status);
      return args;
    }
    case 'deps': {
      if (!id) return null;
      const args = ['dep', 'list', id, '--json'];
      const direction = str(input.direction);
      if (direction && DEPS_DIRECTIONS.has(direction)) args.push('--direction', direction);
      else if (direction) return null;
      const type = str(input.type);
      if (type) args.push('--type', type);
      return args;
    }
    case 'stats': {
      const args = ['count', '--json'];
      const groupBy = str(input.groupBy);
      if (groupBy) {
        const flag = STATS_GROUP_FLAGS[groupBy];
        if (!flag) return null; // an unknown group attribute is bad input
        args.push(flag);
      }
      const status = str(input.status);
      if (status) args.push('--status', status);
      return args;
    }
    case 'stale': {
      // In-flight/open issues with no recent activity (`bd stale`): the board
      // read that surfaces stalled work as explicit control-plane state.
      const args = ['stale', '--json'];
      const limit = Number(input.limit);
      if (Number.isFinite(limit) && limit > 0) args.push('-n', String(Math.min(Math.trunc(limit), 50)));
      return args;
    }
    case 'remember': {
      // An EPHEMERAL wisp labeled `memory` — a memory CANDIDATE with evidence,
      // never silently durable (promotion is the governed review step).
      const title = str(input.title);
      const body = str(input.body);
      if (!title || !body) return null;
      const labels = ['memory'];
      const scope = str(input.scope);
      if (scope) labels.push(`memory-scope:${scope}`);
      const args = ['create', title, '--ephemeral', '-l', labels.join(','), '-d', body, '--json'];
      const discoveredFrom = str(input.discoveredFrom);
      if (discoveredFrom) args.push('--deps', `discovered-from:${discoveredFrom}`);
      return withActor(args, input);
    }
    case 'recall_memory': {
      const query = str(input.query);
      if (!query) return null;
      // --status all: promoted (closed/permanent) memories still count as memory.
      const args = ['search', query, '--label', 'memory', '--status', 'all', '--json'];
      const limit = Number(input.limit);
      args.push('-n', String(Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 50) : 10));
      const scope = str(input.scope);
      if (scope) args.push('--label', `memory-scope:${scope}`);
      return args;
    }
    case 'promote':
      // The REVIEW step: wisp → permanent Dolt-versioned bead. Only the governed
      // memory-lifecycle accept path calls this op — never an agent bridge tool.
      return id ? withActor(['promote', id, '--json'], input) : null;
    case 'flush': {
      // Durability flush: seal any coalesced/deferred working-set as a versioned
      // checkpoint. A clean graph yields bd's truthful `committed:false`.
      const message = str(input.message) ?? 'bd: memory durability flush';
      return ['vc', 'commit', '-m', message, '--json'];
    }
    case 'gc':
      // Lifecycle GC (decay closed/expired wisps + compact + Dolt GC). `--force`
      // skips the interactive confirmation — this is a non-interactive seam.
      return ['gc', '--force', '--json'];
    case 'raw': {
      const raw = Array.isArray(input.args) ? input.args.filter((a): a is string => typeof a === 'string') : null;
      return raw && raw.length > 0 ? raw : null;
    }
    default:
      return null;
  }
}

/** Append bd's global `--actor` audit flag when the write op carries one. */
function withActor(args: string[], input: Record<string, unknown>): string[] {
  const actor = str(input.actor);
  return actor ? [...args, '--actor', actor] : args;
}

/**
 * The MCP binder factory: registers the full `beads.*` issue-graph + memory tools
 * (via the reused `registerBeadsMcpTools`) as thin delegates over THIS adapter's
 * `invoke` seam — the one `bd` spawner. The composer passes the returned binder
 * into `getInteropHostBundle({ engineBinders })` with `adapters.get('beads')`.
 */
export function beadsEngineBinder(engine: EngineClientPort | null): (router: McpToolRouter) => void {
  return (router) => registerBeadsMcpTools(router, { engine });
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
