/**
 * The canonical registry of the 14 domain keys and their edge mount bases.
 *
 * This is pure data — the single source of truth for which domains exist and
 * where their routers mount. The edge `route-table.ts` (Phase 4) and the DI
 * container consume it; it depends on nothing so any layer can import it.
 */

/** The 14 domain keys, in dependency/build order. */
export const DOMAIN_KEYS = [
  'persistence',
  'identity',
  'governance',
  'edge',
  'agent-os',
  'conductor',
  'interop',
  'engines',
  'inference',
  'social',
  'memory',
  'billing',
  'cloud',
  'observability',
] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

export interface DomainDescriptor {
  readonly key: DomainKey;
  /** Base path the domain's edges mount under (empty for non-HTTP-owning). */
  readonly mountBase: string;
  readonly description: string;
}

/**
 * The mount base + one-line responsibility per domain. Kept aligned with
 * ARCHITECTURE §4 and the edge route table.
 */
export const DOMAIN_REGISTRY: Readonly<Record<DomainKey, DomainDescriptor>> = {
  persistence: {
    key: 'persistence',
    mountBase: '/internal/persistence',
    description: 'One pg.Pool, :param QueryExecutor, migrations, KV store.',
  },
  identity: {
    key: 'identity',
    mountBase: '/api/identity',
    description: 'Auth origin: SessionVerifier, sk_ keys, device flow, orgs/RBAC.',
  },
  governance: {
    key: 'governance',
    mountBase: '/api/agent-os',
    description: 'The moat: GovernanceGate.decide, Merkle audit, secrets, locks.',
  },
  edge: {
    key: 'edge',
    mountBase: '',
    description: 'The stateless HTTP/WS surface: middleware chain, route table.',
  },
  'agent-os': {
    key: 'agent-os',
    mountBase: '/api/agent-os',
    description: 'State-of-record: tasks/runs/approvals/artifacts/events/squads.',
  },
  conductor: {
    key: 'conductor',
    mountBase: '/api/conductor',
    description: 'The terminal product: worktree+tmux execution, run-loop.',
  },
  interop: {
    key: 'interop',
    mountBase: '/api/a2a',
    description: 'A2A wire + runtime fan-out + the InteropChain.',
  },
  engines: {
    key: 'engines',
    mountBase: '/api/mcp',
    description: 'The governed engine seam + MCP host.',
  },
  inference: {
    key: 'inference',
    mountBase: '/api/gateway',
    description: 'The LLM/embedding gateway (TensorZero ladder + BYOK).',
  },
  social: {
    key: 'social',
    mountBase: '/api/connectors',
    description: "The agents' human-channel presence + mention gate.",
  },
  memory: {
    key: 'memory',
    mountBase: '/api/agent-os',
    description: 'Recall fusion + gated remember/promote + retrieval.',
  },
  billing: {
    key: 'billing',
    mountBase: '/api/billing',
    description: 'EntitlementGate: plans, metering, quotas, webhooks.',
  },
  cloud: {
    key: 'cloud',
    mountBase: '/api/agent-os/cloud',
    description: 'Off-box substrate: sandboxes, previews, tenancy, mesh.',
  },
  observability: {
    key: 'observability',
    mountBase: '/api/agent-os/observability',
    description: 'Truthful ops: logging, metrics, tracing, health aggregation.',
  },
};

/** Is a string a known domain key? */
export function isDomainKey(value: string): value is DomainKey {
  return (DOMAIN_KEYS as readonly string[]).includes(value);
}
