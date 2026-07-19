/**
 * `beads-graph` in-proc MCP server — the agent-callable READ side over the deeper
 * `bd` (beads) issue-graph, kept in its OWN binder file (and its own serverId) so
 * these query capabilities compose independently of the write/memory tools on the
 * `recoder.beads` server (`beads.ready`/`create`/`close`/`remember`/…). Tools:
 *
 *   - `beads.blocked` — issues with open blockers + the ids blocking each
 *     (`bd blocked`), optionally scoped to a parent bead/epic.
 *   - `beads.graph`   — the dependency tree rooted at an issue (`bd dep tree`):
 *     what blocks it (down), what it blocks (up), or both.
 *   - `beads.deps`    — the flat dependency/dependent records for an issue
 *     (`bd dep list`), optionally filtered by dependency type.
 *   - `beads.search`  — full-text search across issues (`bd search`), optionally
 *     status-scoped and count-limited.
 *   - `beads.stats`   — issue counts (`bd count`), optionally grouped by an
 *     attribute (status/priority/type/assignee/label) — the by-status roll-up.
 *
 * Every tool is READ-ONLY over the SHARED, repo-scoped issue graph (bd IS the
 * cross-agent memory fabric — AGENTS.md). They carry NO per-tenant subject, so
 * they are NOT in the cross-tenant mutation class and bind no {@link McpToolCaller}
 * subject: there is no per-user dimension to leak, and the closed class stays
 * closed (no args-supplied identity is ever trusted). They still traverse
 * interop's `authorize → risk → execute → audit` gate at the host boundary once
 * the integrator registers this server (`engines-module` does, in `start()`),
 * exactly like the sibling ops-recorder-signals tools.
 *
 * DEGRADE-SAFE: handlers delegate to the beads adapter's `invoke`, which returns a
 * typed `{ ok:false, reason }` when `bd` is not resolvable/installed. `runOp`
 * flattens that into a truthful `{ error, code? }` — the tool never throws the
 * seam and never fabricates an issue, edge, or count.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Invoker } from '../adapters/daemon/mcp/daemon-mcp-shared.js';
import { asRecord, readInt, readString, runOp } from '../adapters/daemon/mcp/daemon-mcp-shared.js';

/** The in-proc MCP server id (distinct from the `recoder.beads` write/memory server). */
export const BEADS_GRAPH_MCP_SERVER_ID = 'beads-graph';

/** `bd dep tree` directions. */
const GRAPH_DIRECTIONS = new Set(['down', 'up', 'both']);
/** `bd dep list` directions. */
const DEPS_DIRECTIONS = new Set(['down', 'up']);
/** `bd count --by-*` group attributes. */
const STATS_GROUPS = new Set(['status', 'priority', 'type', 'assignee', 'label']);

/**
 * The `beads-graph` server descriptor for the gated registry catalog. The
 * integrator (`engines-module.start()`) adds this to the host registry + binds the
 * handlers below (mirroring the ops-recorder-signals self-registration). Tool
 * names MUST match {@link buildBeadsGraphMcpTools}.
 */
export const beadsGraphMcpServer = {
  serverId: BEADS_GRAPH_MCP_SERVER_ID,
  // `custom` is the only valid `McpServerKind` for a backend-local engine server
  // (there is no `beads`-owned kind here); matches the mem0/ops-recorder servers.
  kind: 'custom' as const,
  displayName: 'Recoder Beads — Issue-graph queries',
  // `custom` is the valid in-proc transport (no `in-proc` member); matches mem0.
  transport: 'custom' as const,
  enabled: true,
  toolNames: ['beads.blocked', 'beads.graph', 'beads.deps', 'beads.search', 'beads.stats'],
  metadata: { external: false, engine: 'beads' },
};

/**
 * Build the `beads-graph` MCP tool registrations over the beads adapter seam
 * (just `invoke`). Handlers stay thin: validate the filter vocabulary, invoke the
 * typed adapter op, surface the truthful `InvokeResult` via `runOp`.
 */
export function buildBeadsGraphMcpTools(engine: Invoker<unknown>): readonly McpToolRegistration[] {
  return [
    {
      name: 'beads.blocked',
      description:
        'List issues that are blocked (have open blocking dependencies), each with its blocked-by count ' +
        'and the ids of the open issues blocking it. Optional { parent } scopes to descendants of a ' +
        'bead/epic. Read-only over the shared repo issue graph; truthful { error } when bd is unavailable.',
      handler: async (raw: unknown) => {
        const r = asRecord(raw);
        const input: Record<string, unknown> = {};
        const parent = readString(r.parent) ?? readString(r.parentId);
        if (parent !== undefined) input.parent = parent;
        return runOp(engine, 'blocked', input);
      },
    },
    {
      name: 'beads.graph',
      description:
        'The dependency tree rooted at an issue { id }. direction: "down" (what blocks it, default), ' +
        '"up" (what it blocks), or "both". Optional { maxDepth } (int >= 1) bounds the walk and ' +
        '{ status } filters nodes (open|in_progress|blocked|deferred|closed). Read-only.',
      handler: async (raw: unknown) => {
        const r = asRecord(raw);
        const id = readString(r.id) ?? readString(r.issueId);
        if (id === undefined) return { error: 'id is required' };
        const input: Record<string, unknown> = { id };
        const direction = readString(r.direction);
        if (direction !== undefined) {
          if (!GRAPH_DIRECTIONS.has(direction)) {
            return { error: "direction must be 'down', 'up', or 'both'" };
          }
          input.direction = direction;
        }
        const maxDepth = readInt(r.maxDepth);
        if (maxDepth !== undefined) {
          if (maxDepth < 1) return { error: 'maxDepth must be >= 1' };
          input.maxDepth = maxDepth;
        }
        const status = readString(r.status);
        if (status !== undefined) input.status = status;
        return runOp(engine, 'graph', input);
      },
    },
    {
      name: 'beads.deps',
      description:
        'The flat dependency/dependent records for an issue { id }. direction: "down" (what it depends ' +
        'on, default) or "up" (what depends on it). Optional { type } filters by dependency type ' +
        '(e.g. blocks, tracks, parent-child). Read-only; truthful { error } when bd is unavailable.',
      handler: async (raw: unknown) => {
        const r = asRecord(raw);
        const id = readString(r.id) ?? readString(r.issueId);
        if (id === undefined) return { error: 'id is required' };
        const input: Record<string, unknown> = { id };
        const direction = readString(r.direction);
        if (direction !== undefined) {
          if (!DEPS_DIRECTIONS.has(direction)) return { error: "direction must be 'down' or 'up'" };
          input.direction = direction;
        }
        const type = readString(r.type);
        if (type !== undefined) input.type = type;
        return runOp(engine, 'deps', input);
      },
    },
    {
      name: 'beads.search',
      description:
        'Full-text search across issues (title/description/notes) for { query }. Optional { status } ' +
        'scopes results (open|in_progress|blocked|deferred|closed|all) and { limit } (int >= 1, capped ' +
        'at 50 by the adapter) bounds the count. Read-only; truthful { error } when bd is unavailable.',
      handler: async (raw: unknown) => {
        const r = asRecord(raw);
        const query = readString(r.query);
        if (query === undefined) return { error: 'query is required' };
        const input: Record<string, unknown> = { query };
        const status = readString(r.status);
        if (status !== undefined) input.status = status;
        const limit = readInt(r.limit);
        if (limit !== undefined) {
          if (limit < 1) return { error: 'limit must be >= 1' };
          input.limit = limit;
        }
        return runOp(engine, 'search', input);
      },
    },
    {
      name: 'beads.stats',
      description:
        'Issue counts over the shared repo graph. With no args returns the total; { groupBy } ' +
        '(status|priority|type|assignee|label) returns per-group counts (the by-status roll-up is the ' +
        'common one). Optional { status } scopes the count. Read-only; truthful { error } when bd is down.',
      handler: async (raw: unknown) => {
        const r = asRecord(raw);
        const input: Record<string, unknown> = {};
        const groupBy = readString(r.groupBy);
        if (groupBy !== undefined) {
          if (!STATS_GROUPS.has(groupBy)) {
            return { error: 'groupBy must be one of status|priority|type|assignee|label' };
          }
          input.groupBy = groupBy;
        }
        const status = readString(r.status);
        if (status !== undefined) input.status = status;
        return runOp(engine, 'stats', input);
      },
    },
  ];
}
