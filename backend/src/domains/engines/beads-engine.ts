/**
 * beads-engine — the `recoder.beads` MCP tool surface over the ONE beads
 * transport (`BeadsAdapter.invoke`, the single `bd` spawner + argv owner in
 * `backend/src`). Gives an AGENT the issue graph: read ready work, inspect an
 * issue, create / update / close issues, check sync status, and use the shared
 * memory layer (remember/recall). Every call still runs the interop gate
 * (authorize → risk → execute → audit) before reaching here.
 *
 * Every tool is a THIN delegate: validate args at the boundary, invoke the
 * injected engine seam (`{ op, input }` — the adapter owns the argv), surface
 * the result. Fail-closed and truthful: an unbound engine or a failed invoke
 * throws the real reason, which the interop host records as a truthful tool
 * error — never a fabricated result (mirrors the `recoder.browser` binder).
 *
 * `beads.memory_promote` is deliberately NOT registered: promotion is the
 * REVIEW step of the wisp→durable memory-candidate lifecycle and stays on the
 * governed memory-lifecycle accept path only, never an agent bridge tool.
 */
import { beadsMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { Invoker } from './adapters/daemon/mcp/daemon-mcp-shared.js';

/** Options for {@link registerBeadsMcpTools}: the one beads engine seam. */
export interface RegisterBeadsMcpToolsOptions {
  /** The beads adapter's invoke seam (null ⇒ tools throw a truthful not-bound error). */
  readonly engine?: Invoker<unknown> | null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Register the `beads.*` tools on the router as thin delegates over the
 * injected engine seam. Fail-closed on a missing/down `bd`: the handler throws
 * the adapter's truthful reason, which the interop host surfaces as a tool error.
 */
export function registerBeadsMcpTools(
  router: McpToolRouter,
  options: RegisterBeadsMcpToolsOptions = {},
): void {
  const engine = options.engine ?? null;

  /** Delegate one op onto the seam; throw the truthful reason on any failure. */
  const invoke = async (op: string, input: Record<string, unknown>) => {
    if (!engine) {
      throw new Error('beads engine not bound in the engines composer — beads tools unavailable');
    }
    const result = await engine.invoke({ op, input });
    if (!result.ok) throw new Error(result.reason);
    return { content: result.value };
  };

  router.register(beadsMcpServer, 'beads.ready', async () => invoke('ready', {}));

  router.register(beadsMcpServer, 'beads.show', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    return invoke('show', { id });
  });

  router.register(beadsMcpServer, 'beads.create', async (input) => {
    const title = str(input.args.title);
    if (!title) throw new Error('title is required');
    const description = str(input.args.description ?? input.args.body);
    // AGENTS.md: link newly discovered work with discovered-from:<parent-id>.
    const discoveredFrom = str(input.args.discoveredFrom);
    const labels = str(input.args.labels);
    return invoke('create', {
      title,
      ...(description ? { description } : {}),
      ...(discoveredFrom ? { discoveredFrom } : {}),
      ...(labels ? { labels } : {}),
    });
  });

  router.register(beadsMcpServer, 'beads.update', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    const status = str(input.args.status);
    return invoke('update', { id, ...(status ? { status } : {}) });
  });

  router.register(beadsMcpServer, 'beads.close', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    const reason = str(input.args.reason);
    return invoke('close', { id, ...(reason ? { reason } : {}) });
  });

  router.register(beadsMcpServer, 'beads.sync', async () => invoke('sync', {}));

  router.register(beadsMcpServer, 'beads.claim', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    return invoke('claim', { id });
  });

  router.register(beadsMcpServer, 'beads.note', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    const text = str(input.args.text ?? input.args.note);
    if (!id) throw new Error('id is required');
    if (!text) throw new Error('text is required');
    return invoke('note', { id, text });
  });

  // ---- Memory layer (bd IS the agents' shared memory) ----------------------
  // Contract (AGENTS.md): agents never write durable memory directly. `remember`
  // creates an EPHEMERAL wisp labeled `memory` (subject to TTL compaction) — a
  // memory CANDIDATE with evidence. Promotion (review step, policy-gated) stays
  // on the governed memory-lifecycle path and is NOT an agent bridge tool.
  // `recall` searches candidates + promoted memories alike.

  router.register(beadsMcpServer, 'beads.remember', async (input) => {
    const title = str(input.args.title);
    const body = str(input.args.body ?? input.args.evidence ?? input.args.description);
    if (!title) throw new Error('title is required');
    if (!body) throw new Error('body (the memory content + evidence) is required');
    const scope = str(input.args.scope);
    const discoveredFrom = str(input.args.discoveredFrom ?? input.args.from);
    return invoke('remember', {
      title,
      body,
      ...(scope ? { scope } : {}),
      ...(discoveredFrom ? { discoveredFrom } : {}),
    });
  });

  router.register(beadsMcpServer, 'beads.recall', async (input) => {
    const query = str(input.args.query);
    if (!query) throw new Error('query is required');
    const scope = str(input.args.scope);
    const limit = Number(input.args.limit);
    return invoke('recall_memory', {
      query,
      ...(scope ? { scope } : {}),
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    });
  });
}
