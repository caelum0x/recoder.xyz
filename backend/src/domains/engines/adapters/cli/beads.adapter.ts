/**
 * `BeadsAdapter` — the `EngineClientPort` over the `bd` (beads) issue-graph CLI,
 * the cross-agent shared-memory fabric (AGENTS.md: "beads IS the memory layer").
 * It REUSES `conductor/beads-bin.ts`'s owned-binary resolver (BEADS_BIN → vendored
 * build → PATH) so the seam shells to the SAME `bd` the conductor drives — never a
 * random PATH binary.
 *
 * `invoke` maps ops onto real `bd` subcommands (`ready`, `show`, `create`,
 * `update`, `close`, `claim`, `note`, `search`, `vc status`) plus the DEEPER
 * issue-graph reads (`blocked`, `dep tree`, `dep list`, `count`) through the
 * bounded, degrade-safe `runCli` primitive; the issue graph is the raw transport
 * the seam owns (conflict #8). The exported binder reuses `registerBeadsMcpTools`
 * (agent-os/mcp/beads-engine.ts) so the full `beads.*` agent-callable surface is
 * registered behind the interop gate; the graph-query reads are exposed as a
 * SECOND server via `buildBeadsGraphMcpTools` over this same adapter seam.
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
import type { EngineCall } from '../../ports/engine-client.port.js';
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
    const args = this.buildArgs(op, input);
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

  /** Translate an op + input into a concrete `bd` argv (null → invalid). */
  private buildArgs(op: BeadsOp, input: Record<string, unknown>): string[] | null {
    const id = str(input.id) ?? str(input.issueId);
    switch (op) {
      case 'ready':
        return ['ready', '--json'];
      case 'sync':
        return ['vc', 'status'];
      case 'show':
        return id ? ['show', id, '--json'] : null;
      case 'claim':
        return id ? ['update', id, '--claim', '--json'] : null;
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
        return args;
      }
      case 'update': {
        if (!id) return null;
        const args = ['update', id, '--json'];
        const status = str(input.status);
        if (status) args.push('--status', status);
        return args;
      }
      case 'close': {
        if (!id) return null;
        const args = ['close', id, '--json'];
        const reason = str(input.reason);
        if (reason) args.push('--reason', reason);
        return args;
      }
      case 'note': {
        const text = str(input.text ?? input.note);
        if (!id || !text) return null;
        return ['note', id, text, '--json'];
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
      case 'raw': {
        const raw = Array.isArray(input.args) ? input.args.filter((a): a is string => typeof a === 'string') : null;
        return raw && raw.length > 0 ? raw : null;
      }
      default:
        return null;
    }
  }
}

/**
 * The MCP binder factory: registers the full `beads.*` issue-graph + memory tools
 * (via the reused `registerBeadsMcpTools`) onto the shared in-proc router. The
 * composer passes the returned binder into `getInteropHostBundle({ engineBinders })`.
 */
export function beadsEngineBinder(options: { cwd?: string } = {}): (router: McpToolRouter) => void {
  return (router) => registerBeadsMcpTools(router, options);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
