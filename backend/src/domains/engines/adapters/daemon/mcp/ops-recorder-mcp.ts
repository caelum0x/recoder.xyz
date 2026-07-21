/**
 * `ops-recorder` in-proc MCP server — the agent-callable skin over the
 * work-signals detector adapter. Tools cover the detector + store surface:
 *   - `ops-recorder.sync`    — run the GitHub/Linear stuck-work detector.
 *   - `ops-recorder.list`    — read all detected work-signals.
 *   - `ops-recorder.get`     — read one work-signal.
 *   - `ops-recorder.ingest`  — push one already-detected stuck-work item.
 *   - `ops-recorder.handoff` — (re)generate a signal's agent handoff prompt.
 *   - `ops-recorder.resolve` — mark a signal resolved / re-open it (governed write).
 *
 * The composer seeds `opsRecorderMcpServer` into the gated registry and binds
 * these handlers; the interop gate risk-classifies the writes at the boundary.
 *
 * REGISTRATION SCOPE (engines-module `bindOpsRecorderWriteMcpTools`): only the
 * WRITE/DETECT tools with a real product use are bound on the host —
 * {@link OPS_RECORDER_WRITE_TOOL_NAMES} (`sync` / `ingest` / `resolve`). The
 * pure-read `ops-recorder.list` / `ops-recorder.get` are intentionally left
 * unregistered — their read surface is served by the `ops-recorder.query` /
 * `ops-recorder.stats` tools on the sibling `ops-recorder-signals` server
 * (`ops-recorder-signals-mcp.ts`) — and `ops-recorder.handoff` is deferred (no
 * product consumer yet). The builder still exposes all six for direct/manual use.
 */
import type { McpToolRegistration } from '../../../../../shared/module-base.js';
import type { OpsRecorderRequest } from '../ops-recorder-loopback.adapter.js';
import type { OpsRecorderIngestShape } from '../../../ops-recorder-adapter.js';
import { asRecord, readBool, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const OPS_RECORDER_MCP_SERVER_ID = 'ops-recorder';

/**
 * The write/detect tools the host actually registers (§8.4). A subset of the
 * builder's tools: the reads (`list`/`get`) are covered by the signals server's
 * `query`/`stats`, and `handoff` has no consumer yet — documented, not registered,
 * so the gated catalog carries no executor-less orphan tool.
 */
export const OPS_RECORDER_WRITE_TOOL_NAMES = [
  'ops-recorder.sync',
  'ops-recorder.ingest',
  'ops-recorder.resolve',
] as const;

export const opsRecorderMcpServer = {
  serverId: OPS_RECORDER_MCP_SERVER_ID,
  // `custom` is the only valid `McpServerKind` for a backend-local engine server
  // (there is no `engines` kind); `custom` is the valid in-proc transport (no
  // `in-proc` member). Matches the sibling `ops-recorder-signals` descriptor so
  // this server is a valid `McpServerRegistration` the host can register.
  kind: 'custom' as const,
  displayName: 'Ops Recorder (stuck-work signal detector)',
  transport: 'custom' as const,
  enabled: true,
  toolNames: [
    'ops-recorder.sync',
    'ops-recorder.list',
    'ops-recorder.get',
    'ops-recorder.ingest',
    'ops-recorder.handoff',
    'ops-recorder.resolve',
  ] as readonly string[],
  metadata: { external: false, engine: 'ops-recorder' },
};

export function buildOpsRecorderMcpTools(
  engine: Invoker<OpsRecorderRequest>,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'ops-recorder.sync',
      description:
        'Trigger the stuck-work detector for a source (github|linear): polls the source, ' +
        'runs detectors, normalizes + generates handoffs, stores signals. Poll ops-recorder.list after.',
      handler: async (raw: unknown) => {
        const source = readString(asRecord(raw).source);
        if (source !== 'github' && source !== 'linear') {
          return { error: "source must be 'github' or 'linear'" };
        }
        return runOp<OpsRecorderRequest>(engine, `sync.${source}`, {});
      },
    },
    {
      name: 'ops-recorder.list',
      description: 'List every detected work-signal (stuck PRs/issues), sorted by priority then detection time.',
      handler: async () => runOp<OpsRecorderRequest>(engine, 'list', {}),
    },
    {
      name: 'ops-recorder.get',
      description: 'Fetch one detected work-signal by id.',
      handler: async (raw: unknown) => {
        const signalId = readString(asRecord(raw).signalId);
        if (!signalId) return { error: 'signalId (string) is required' };
        return runOp<OpsRecorderRequest>(engine, 'get', { signalId });
      },
    },
    {
      name: 'ops-recorder.ingest',
      description:
        'Push one already-detected stuck-work item (WorkSignalIngest: source, item_type, title, ' +
        'source_url, detected_reason, priority). Idempotent on (source, source_url).',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const signal = coerceIngestShape(args.signal ?? args);
        if (!signal) {
          return {
            error:
              'ingest requires source, item_type, title, source_url, detected_reason, priority (all non-empty strings)',
          };
        }
        return runOp<OpsRecorderRequest>(engine, 'ingest', { signal });
      },
    },
    {
      name: 'ops-recorder.handoff',
      description: '(Re)generate the agent handoff prompt for a detected work-signal.',
      handler: async (raw: unknown) => {
        const signalId = readString(asRecord(raw).signalId);
        if (!signalId) return { error: 'signalId (string) is required' };
        return runOp<OpsRecorderRequest>(engine, 'handoff', { signalId });
      },
    },
    {
      name: 'ops-recorder.resolve',
      description: 'Mark a work-signal resolved (true) or re-open it (false). Governed write.',
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const signalId = readString(args.signalId);
        const resolved = readBool(args.resolved);
        if (!signalId) return { error: 'signalId (string) is required' };
        if (resolved === undefined) return { error: 'resolved (boolean) is required' };
        return runOp<OpsRecorderRequest>(engine, 'status', { signalId, resolved });
      },
    },
  ];
}

/** Coerce unknown MCP args into a `WorkSignalIngest` shape, or null when incomplete. */
function coerceIngestShape(raw: unknown): OpsRecorderIngestShape | null {
  const r = asRecord(raw);
  const required = ['source', 'item_type', 'title', 'source_url', 'detected_reason', 'priority'] as const;
  const shape: Record<string, string> = {};
  for (const key of required) {
    const value = readString(r[key]);
    if (!value) return null;
    shape[key] = value;
  }
  const optional = ['assignee', 'status', 'why_it_matters', 'recommended_next_action'] as const;
  for (const key of optional) {
    const value = readString(r[key]);
    if (value) shape[key] = value;
  }
  return shape as unknown as OpsRecorderIngestShape;
}
