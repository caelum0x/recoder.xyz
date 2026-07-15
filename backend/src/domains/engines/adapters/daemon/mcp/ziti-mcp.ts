/**
 * `ziti` in-proc MCP server — the agent-callable skin over the OpenZiti
 * zero-trust identity control-plane adapter. Tools:
 *   - `ziti.identities.list`   — list Ziti identities (optional filter).
 *   - `ziti.identity.provision`— provision a `recoder-runner`-tagged runner identity
 *     (returns the OTT enrollment JWT the runner uses to join the overlay). Governed write.
 *   - `ziti.identity.delete`   — remove an identity. Governed write.
 *
 * Enrollment is NEVER faked — an unconfigured/unreachable controller degrades to
 * a truthful error. The composer seeds `zitiMcpServer` into the gated registry
 * and binds these handlers; the interop gate risk-classifies the writes.
 */
import type { McpToolRegistration } from '../../../../../shared/module-base.js';
import type { ZitiRequest } from '../ziti-rest.adapter.js';
import { asRecord, readString, runOp, type Invoker } from './daemon-mcp-shared.js';

export const ZITI_MCP_SERVER_ID = 'ziti';

export const zitiMcpServer = {
  serverId: ZITI_MCP_SERVER_ID,
  kind: 'engines',
  displayName: 'OpenZiti (zero-trust identity / enrollment)',
  transport: 'in-proc' as const,
  enabled: true,
  toolNames: [
    'ziti.identities.list',
    'ziti.identity.provision',
    'ziti.identity.delete',
  ] as readonly string[],
  metadata: { external: false, engine: 'ziti' },
};

export function buildZitiMcpTools(engine: Invoker<ZitiRequest>): readonly McpToolRegistration[] {
  return [
    {
      name: 'ziti.identities.list',
      description: 'List OpenZiti identities from the controller (optional Ziti filter expression).',
      handler: async (raw: unknown) => {
        const filter = readString(asRecord(raw).filter);
        return runOp<ZitiRequest>(engine, 'identities.list', filter ? { filter } : {});
      },
    },
    {
      name: 'ziti.identity.provision',
      description:
        'Provision a zero-trust runner identity (tagged recoder-runner) and return its one-time ' +
        'enrollment JWT so the runner can join the overlay. Governed write.',
      handler: async (raw: unknown) => {
        const name = readString(asRecord(raw).name);
        if (!name) return { error: 'name (string) is required' };
        return runOp<ZitiRequest>(engine, 'identity.provision', { name });
      },
    },
    {
      name: 'ziti.identity.delete',
      description: 'Delete an OpenZiti identity by id (revokes overlay access). Governed write.',
      handler: async (raw: unknown) => {
        const id = readString(asRecord(raw).id);
        if (!id) return { error: 'id (string) is required' };
        return runOp<ZitiRequest>(engine, 'identity.delete', { id });
      },
    },
  ];
}
