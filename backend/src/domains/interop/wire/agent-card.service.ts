/**
 * `agent-card.service` — SKELETON. Serves this instance's local A2A agent-card
 * and resolves + caches remote cards. The wire group binds the builder to
 * `@recoder/interop`'s agent-card builder and the remote fetch to the transport;
 * this scaffold gives the composer a stable surface + a truthful degrade path.
 *
 * Degrade-safe: `resolveRemoteCard` returns `null` (never a fabricated card)
 * until the wire group wires the real fetch.
 */
import type { AgentCard } from '../types.js';

/** Static inputs for the local agent-card (bootstrap-provided). */
export interface LocalCardInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url?: string;
  readonly capabilities: readonly string[];
  readonly publicKey?: string;
  readonly version?: string;
}

/** Local + remote agent-card surface the wire group implements. */
export interface AgentCardService {
  getLocalAgentCard(): AgentCard;
  resolveRemoteCard(ref: string): Promise<AgentCard | null>;
}

/**
 * Scaffold agent-card service. The local card is served from the injected
 * static input; remote resolution is a truthful `null` (no fake cards) until the
 * transport fetch is wired.
 */
export function createAgentCardService(local: LocalCardInput): AgentCardService {
  const localCard: AgentCard = {
    id: local.id,
    name: local.name,
    description: local.description,
    url: local.url,
    capabilities: [...local.capabilities],
    publicKey: local.publicKey,
    version: local.version,
  };
  return {
    getLocalAgentCard(): AgentCard {
      return localCard;
    },
    async resolveRemoteCard(_ref: string): Promise<AgentCard | null> {
      // Wire group: fetch + cache the remote card via the transport. Until then,
      // report "unknown" truthfully rather than fabricating a capability set.
      return null;
    },
  };
}
