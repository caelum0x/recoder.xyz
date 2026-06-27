// Owned by Recoder. The raw gateway imported `../../routing/resolve-route.js`
// for the inbound→agent routing decision. That routing sibling was not part of
// the extraction. `resolveAgentRoute()` maps an inbound (channel, account,
// guild, peer) to the bound agent id and the deterministic session keys that
// inbound is routed under. Reconstructed here as real, dependency-free routing:
// the agent is resolved from `cfg` bindings (most-specific match wins), falling
// back to `cfg.defaultAgent` and then the literal `default` agent; session keys
// are derived deterministically from the resolved agent + peer.

import type { OpenClawConfig, AgentRouteConfig } from "../config/config.js";
import { normalizeAccountId } from "./session-key.js";

export type RoutePeerKind = "dm" | "group" | "channel" | "thread";

export interface RoutePeer {
  kind: RoutePeerKind;
  id: string;
}

export interface ResolveAgentRouteParams {
  cfg: OpenClawConfig;
  channel: string;
  accountId: string;
  guildId?: string;
  peer: RoutePeer;
  parentPeer?: RoutePeer;
}

export interface AgentRoute {
  /** Resolved agent id this inbound binds to. */
  agentId: string;
  /** Channel the inbound arrived on (echoed for downstream convenience). */
  channel: string;
  /** Session key the inbound message routes under. */
  sessionKey: string;
  /**
   * Session key of the conversation root. Equals {@link sessionKey} for a
   * top-level peer; for a child peer (e.g. a thread bound via `parentPeer`) it
   * is the parent conversation's key.
   */
  mainSessionKey: string;
}

const DEFAULT_AGENT_ID = "default";

function listAgentConfigs(cfg: OpenClawConfig): AgentRouteConfig[] {
  const agents = cfg.agents;
  if (!agents) {
    return [];
  }
  if (Array.isArray(agents)) {
    return agents;
  }
  return Object.values(agents);
}

/**
 * Score how specifically a binding matches the inbound. A binding that names a
 * field must match it; unspecified fields are wildcards. Returns `-1` for a
 * non-match, otherwise the number of fields that matched (higher = more
 * specific).
 */
function scoreBinding(
  binding: NonNullable<AgentRouteConfig["bindings"]>[number],
  params: ResolveAgentRouteParams,
  accountId: string,
): number {
  let score = 0;
  if (binding.channel !== undefined) {
    if (binding.channel !== params.channel) {
      return -1;
    }
    score += 1;
  }
  if (binding.accountId !== undefined) {
    if (normalizeAccountId(binding.accountId) !== accountId) {
      return -1;
    }
    score += 1;
  }
  if (binding.guildId !== undefined) {
    if (binding.guildId !== params.guildId) {
      return -1;
    }
    score += 1;
  }
  if (binding.peerKind !== undefined) {
    if (binding.peerKind !== params.peer.kind) {
      return -1;
    }
    score += 1;
  }
  if (binding.peerId !== undefined) {
    if (binding.peerId !== params.peer.id) {
      return -1;
    }
    score += 1;
  }
  return score;
}

function resolveAgentId(params: ResolveAgentRouteParams, accountId: string): string {
  let bestAgentId: string | undefined;
  let bestScore = -1;
  for (const agent of listAgentConfigs(params.cfg)) {
    for (const binding of agent.bindings ?? []) {
      const score = scoreBinding(binding, params, accountId);
      if (score > bestScore) {
        bestScore = score;
        bestAgentId = agent.id;
      }
    }
  }
  if (bestAgentId) {
    return bestAgentId;
  }
  return params.cfg.defaultAgent?.trim() || DEFAULT_AGENT_ID;
}

function buildSessionKey(
  agentId: string,
  channel: string,
  accountId: string,
  peer: RoutePeer,
): string {
  return `agent:${agentId}:${channel}:${accountId}:${peer.kind}:${peer.id}`;
}

/**
 * Resolve the agent + session keys for an inbound message. The agent is chosen
 * by the most specific matching binding in `cfg` (falling back to the default
 * agent); the inbound session key is derived from the agent + the message peer,
 * and `mainSessionKey` from the parent peer when present.
 */
export function resolveAgentRoute(params: ResolveAgentRouteParams): AgentRoute {
  const accountId = normalizeAccountId(params.accountId);
  const agentId = resolveAgentId(params, accountId);
  const sessionKey = buildSessionKey(agentId, params.channel, accountId, params.peer);
  const mainSessionKey = params.parentPeer
    ? buildSessionKey(agentId, params.channel, accountId, params.parentPeer)
    : sessionKey;
  return {
    agentId,
    channel: params.channel,
    sessionKey,
    mainSessionKey,
  };
}
