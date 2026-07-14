/**
 * beads-engine — the concrete executor behind the `recoder.beads` MCP server.
 *
 * Gives an AGENT the issue graph: read ready work, inspect an issue, create /
 * update / close issues, and check sync status — by shelling to the `bd`
 * (beads) CLI in the project repo. Every call still runs the interop gate
 * (authorize → risk → execute → audit) before reaching here.
 *
 * Degrade-safe: when `bd` is not installed the tools return a truthful
 * "not available" error rather than a fabricated result. The runner is
 * injectable so the wiring is testable without the real binary.
 */
import { execFileSync } from 'node:child_process';
import { beadsMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter } from '@recoder/agent-mcp';
import { beadsBin } from '../../conductor/beads-sync.js';

/** Runs a `bd` invocation and returns stdout. Injectable for tests. */
export type BeadsRunner = (args: string[]) => string;

function defaultRunner(cwd: string): BeadsRunner {
  return (args) =>
    execFileSync(beadsBin(), args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function parseJson(out: string): unknown {
  const trimmed = out.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // bd printed human text (e.g. an id line) — return it raw.
    return trimmed;
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Register the six beads tools on the router. `cwd` is the repo the issue graph
 * lives in (the conductor base repo by default). Fail-closed on missing bd:
 * the handler throws, which the interop host surfaces as a truthful tool error.
 */
export function registerBeadsMcpTools(
  router: McpToolRouter,
  options: { cwd?: string; runner?: BeadsRunner } = {},
): void {
  const cwd = options.cwd || process.env.CONDUCTOR_REPO_ROOT || process.cwd();
  const run = options.runner || defaultRunner(cwd);

  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ENOENT|not found|command not found/i.test(msg)) {
        throw new Error('beads (bd) is not installed on this host');
      }
      throw new Error(`bd failed: ${msg.slice(0, 300)}`);
    }
  };

  router.register(beadsMcpServer, 'beads.ready', async () => ({
    content: guard(() => parseJson(run(['ready', '--json']))),
  }));

  router.register(beadsMcpServer, 'beads.show', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    return { content: guard(() => parseJson(run(['show', id, '--json']))) };
  });

  router.register(beadsMcpServer, 'beads.create', async (input) => {
    const title = str(input.args.title);
    if (!title) throw new Error('title is required');
    const args = ['create', title, '--json'];
    const description = str(input.args.description ?? input.args.body);
    if (description) args.push('-d', description);
    // AGENTS.md: link newly discovered work with discovered-from:<parent-id>.
    const discoveredFrom = str(input.args.discoveredFrom);
    if (discoveredFrom) args.push('--deps', `discovered-from:${discoveredFrom}`);
    const labels = str(input.args.labels);
    if (labels) args.push('-l', labels);
    return { content: guard(() => parseJson(run(args))) };
  });

  router.register(beadsMcpServer, 'beads.update', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    const args = ['update', id, '--json'];
    const status = str(input.args.status);
    if (status) args.push('--status', status);
    return { content: guard(() => parseJson(run(args))) };
  });

  router.register(beadsMcpServer, 'beads.close', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    const args = ['close', id, '--json'];
    const reason = str(input.args.reason);
    if (reason) args.push('--reason', reason);
    return { content: guard(() => parseJson(run(args))) };
  });

  router.register(beadsMcpServer, 'beads.sync', async () => ({
    content: guard(() => parseJson(run(['vc', 'status']))),
  }));

  // ---- Memory layer (bd IS the agents' shared memory) ----------------------
  // Contract (AGENTS.md): agents never write durable memory directly. `remember`
  // creates an EPHEMERAL wisp labeled `memory` (subject to TTL compaction) — a
  // memory CANDIDATE with evidence. `memory.promote` (review step, policy-gated,
  // deliberately NOT exposed as an agent bridge tool) copies it to the permanent
  // Dolt-versioned table. `recall` searches candidates + promoted memories alike.

  router.register(beadsMcpServer, 'beads.claim', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    return { content: guard(() => parseJson(run(['update', id, '--claim', '--json']))) };
  });

  router.register(beadsMcpServer, 'beads.note', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    const text = str(input.args.text ?? input.args.note);
    if (!id) throw new Error('id is required');
    if (!text) throw new Error('text is required');
    return { content: guard(() => parseJson(run(['note', id, text, '--json']))) };
  });

  router.register(beadsMcpServer, 'beads.remember', async (input) => {
    const title = str(input.args.title);
    const body = str(input.args.body ?? input.args.evidence ?? input.args.description);
    if (!title) throw new Error('title is required');
    if (!body) throw new Error('body (the memory content + evidence) is required');
    const labels = ['memory'];
    const scope = str(input.args.scope);
    if (scope) labels.push(`memory-scope:${scope}`);
    const args = ['create', title, '--ephemeral', '-l', labels.join(','), '-d', body, '--json'];
    const from = str(input.args.discoveredFrom ?? input.args.from);
    if (from) args.push('--deps', `discovered-from:${from}`);
    return { content: guard(() => parseJson(run(args))) };
  });

  router.register(beadsMcpServer, 'beads.recall', async (input) => {
    const query = str(input.args.query);
    if (!query) throw new Error('query is required');
    // --status all: promoted (closed/permanent) memories still count as memory.
    const args = ['search', query, '--label', 'memory', '--status', 'all', '--json'];
    const limit = Number(input.args.limit);
    args.push('-n', String(Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10));
    const scope = str(input.args.scope);
    if (scope) args.push('--label', `memory-scope:${scope}`);
    return { content: guard(() => parseJson(run(args))) };
  });

  router.register(beadsMcpServer, 'beads.memory_promote', async (input) => {
    const id = str(input.args.id) ?? str(input.args.issueId);
    if (!id) throw new Error('id is required');
    return { content: guard(() => parseJson(run(['promote', id, '--json']))) };
  });
}
