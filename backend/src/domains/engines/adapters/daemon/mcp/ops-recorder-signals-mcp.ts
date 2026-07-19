/**
 * `ops-recorder-signals` in-proc MCP server — the agent-callable read-side over
 * the work-signals detector's query + aggregation surface. Kept in its OWN
 * binder file (and its own serverId) so the query capability composes
 * independently of the write/detect tools in `ops-recorder-mcp.ts`:
 *   - `ops-recorder.query` — filtered, sorted view of recorded signals.
 *   - `ops-recorder.stats` — aggregation roll-up (counts + detection window).
 *
 * Both tools are READ-ONLY over the engine's GLOBAL signal store — they carry
 * no per-tenant subject, so they are NOT in the cross-tenant mutation class and
 * bind no `McpToolCaller` subject (the closed class stays closed). They still
 * traverse interop's `authorize → risk → execute → audit` gate at the host
 * boundary once the integrator registers this server, exactly like the sibling
 * ops-recorder tools. Handlers stay thin: validate the filter vocabulary,
 * invoke the typed engine op, surface the truthful `InvokeResult`.
 */
import type { McpToolRegistration } from '../../../../../shared/module-base.js';
import type {
  OpsRecorderRequest,
  OpsRecorderSignalFilters,
} from '../ops-recorder-loopback.adapter.js';
import { asRecord, readBool, readInt, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const OPS_RECORDER_SIGNALS_MCP_SERVER_ID = 'ops-recorder-signals';

export const opsRecorderSignalsMcpServer = {
  serverId: OPS_RECORDER_SIGNALS_MCP_SERVER_ID,
  // `custom` is the only valid `McpServerKind` for a backend-local engine server
  // (there is no `engines` kind); matches the mem0 insight server's descriptor.
  kind: 'custom' as const,
  displayName: 'Ops Recorder — Signals Query & Aggregation',
  // `custom` is the valid in-proc transport (no `in-proc` member); matches mem0.
  transport: 'custom' as const,
  enabled: true,
  toolNames: ['ops-recorder.query', 'ops-recorder.stats'],
  metadata: { external: false, engine: 'ops-recorder' },
};

const SOURCES = new Set(['github', 'linear']);
const ITEM_TYPES = new Set(['pull_request', 'issue']);
const PRIORITIES = new Set(['high', 'medium', 'low']);

/**
 * Coerce unknown MCP args into a validated {@link OpsRecorderSignalFilters}, or
 * return a truthful `{ error }` when an enum-ish field carries an unknown value
 * or `limit` is negative. All fields are optional — an empty args object yields
 * an empty (match-everything) filter set.
 */
function coerceFilters(
  raw: unknown,
): { filters: OpsRecorderSignalFilters } | { error: string } {
  const r = asRecord(raw);
  const filters: {
    source?: string;
    itemType?: string;
    priority?: string;
    resolved?: boolean;
    since?: string;
    until?: string;
    limit?: number;
  } = {};

  const source = readString(r.source);
  if (source !== undefined) {
    if (!SOURCES.has(source)) return { error: "source must be 'github' or 'linear'" };
    filters.source = source;
  }

  // Accept both `itemType` (camel) and `item_type` (wire) from callers.
  const itemType = readString(r.itemType) ?? readString(r.item_type);
  if (itemType !== undefined) {
    if (!ITEM_TYPES.has(itemType)) return { error: "item_type must be 'pull_request' or 'issue'" };
    filters.itemType = itemType;
  }

  const priority = readString(r.priority);
  if (priority !== undefined) {
    if (!PRIORITIES.has(priority)) return { error: "priority must be 'high', 'medium', or 'low'" };
    filters.priority = priority;
  }

  const resolved = readBool(r.resolved);
  if (resolved !== undefined) filters.resolved = resolved;

  const since = readString(r.since);
  if (since !== undefined) filters.since = since;
  const until = readString(r.until);
  if (until !== undefined) filters.until = until;

  const limit = readInt(r.limit);
  if (limit !== undefined) {
    if (limit < 0) return { error: 'limit must be >= 0' };
    filters.limit = limit;
  }

  return { filters };
}

export function buildOpsRecorderSignalsMcpTools(
  engine: Invoker<OpsRecorderRequest>,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'ops-recorder.query',
      description:
        'Filtered, sorted view of recorded work-signals. Optional filters (AND): ' +
        'source (github|linear), item_type (pull_request|issue), priority (high|medium|low), ' +
        'resolved (bool), since/until (ISO-8601 detection-time window), limit (int >= 0). ' +
        'No filters returns every signal, priority-then-detection-time ordered.',
      handler: async (raw: unknown) => {
        const coerced = coerceFilters(raw);
        if ('error' in coerced) return { error: coerced.error };
        return runOp<OpsRecorderRequest>(engine, 'signals.query', { filters: coerced.filters });
      },
    },
    {
      name: 'ops-recorder.stats',
      description:
        'Aggregation roll-up over recorded work-signals: total plus counts by source, ' +
        'item_type, priority, and status (open/resolved), and the oldest/newest detection ' +
        'timestamps. Accepts the same filters as ops-recorder.query (except limit) to scope ' +
        'the aggregation, e.g. { source: "github", since: "2026-01-01T00:00:00Z" }.',
      handler: async (raw: unknown) => {
        const coerced = coerceFilters(raw);
        if ('error' in coerced) return { error: coerced.error };
        return runOp<OpsRecorderRequest>(engine, 'signals.stats', { filters: coerced.filters });
      },
    },
  ];
}
