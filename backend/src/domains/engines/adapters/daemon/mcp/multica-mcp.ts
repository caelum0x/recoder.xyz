/**
 * `multica` in-proc MCP server — the agent-callable skin over the Multica
 * managed-agents / squads adapter. Tools cover squad leader-routing:
 *   - `multica.squads.list` — list squads + their leader_id/members.
 *   - `multica.squad.get`   — one squad's leader-routing config.
 *   - `multica.assign`      — route a task to an agent or a squad leader (governed write).
 *
 * Multica is an OPTIONAL enrichment over the local squad service, so every tool
 * degrades truthfully when the server is down. The composer seeds `multicaMcpServer`
 * into the gated registry and binds these handlers.
 */
import type { McpToolRegistration } from '../../../../../shared/module-base.js';
import type { MulticaRequest } from '../multica-loopback.adapter.js';
import { asRecord, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const MULTICA_MCP_SERVER_ID = 'multica';

export const multicaMcpServer = {
  serverId: MULTICA_MCP_SERVER_ID,
  kind: 'engines',
  displayName: 'Multica (managed-agents / squad leader-routing)',
  transport: 'in-proc' as const,
  enabled: true,
  toolNames: ['multica.squads.list', 'multica.squad.get', 'multica.assign'] as readonly string[],
  metadata: { external: false, engine: 'multica' },
};

export function buildMulticaMcpTools(engine: Invoker<MulticaRequest>): readonly McpToolRegistration[] {
  return [
    {
      name: 'multica.squads.list',
      description: 'List Multica squads with their leader_id and member counts (leader-routing config).',
      handler: async () => runOp<MulticaRequest>(engine, 'squads.list', {}),
    },
    {
      name: 'multica.squad.get',
      description: 'Fetch one Multica squad by id (its leader and members).',
      handler: async (raw: unknown) => {
        const squadId = readString(asRecord(raw).squadId);
        if (!squadId) return { error: 'squadId (string) is required' };
        return runOp<MulticaRequest>(engine, 'squad.get', { squadId });
      },
    },
    {
      name: 'multica.assign',
      description:
        'Route a task to an agent or a squad (via its leader). Requires title, assigneeId, and ' +
        "assigneeType ('agent' | 'squad'). Governed write.",
      handler: async (raw: unknown) => {
        const args = asRecord(raw);
        const title = readString(args.title);
        const assigneeId = readString(args.assigneeId);
        const assigneeType = readString(args.assigneeType);
        if (!title) return { error: 'title (string) is required' };
        if (!assigneeId) return { error: 'assigneeId (string) is required' };
        if (assigneeType !== 'agent' && assigneeType !== 'squad') {
          return { error: "assigneeType must be 'agent' or 'squad'" };
        }
        return runOp<MulticaRequest>(engine, 'assign', { title, assigneeId, assigneeType });
      },
    },
  ];
}
