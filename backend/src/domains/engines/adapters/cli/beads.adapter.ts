/**
 * `BeadsAdapter` — the `EngineClientPort` over the `bd` (beads) issue-graph CLI,
 * the cross-agent shared-memory fabric (AGENTS.md: "beads IS the memory layer").
 * It REUSES `conductor/beads-bin.ts`'s owned-binary resolver (BEADS_BIN → vendored
 * build → PATH) so the seam shells to the SAME `bd` the conductor drives — never a
 * random PATH binary.
 *
 * `invoke` maps ops onto real `bd` subcommands (`ready`, `show`, `create`,
 * `update`, `close`, `claim`, `note`, `search`, `vc status`) through the bounded,
 * degrade-safe `runCli` primitive; the issue graph is the raw transport the seam
 * owns (conflict #8). The exported binder reuses `registerBeadsMcpTools`
 * (agent-os/mcp/beads-engine.ts) so the full `beads.*` agent-callable surface is
 * registered behind the interop gate.
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
  | 'raw';

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
