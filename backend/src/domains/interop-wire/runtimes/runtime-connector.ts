/**
 * `runtime-connector` — the shared shape every coding-agent runtime connector
 * produces so it can be REGISTERED as a `kind:'runtime'` A2A agent in the interop
 * registry. Each runtime (claude/codex/opencode/cursor/windsurf/replit) advertises
 * a capability card; registering it makes it a dispatch target for `message/send`
 * (routed through the conductor `createWorkspace` seam by `multi-dispatch`).
 *
 * These descriptors mirror the runtime surfaces in `@recoder/agent-runtimes` but
 * are declared STATICALLY here so registration is degrade-safe: it never requires
 * the agent-runtimes package to be resolvable on disk at import time. When the
 * package IS present, bootstrap may still bind the live adapter for execution; the
 * registry only needs the advertised card.
 */
import type { AgentCard, UpsertAgentInput } from '../types.js';

/** A runtime connector descriptor (the advertised A2A identity of a runtime). */
export interface RuntimeConnectorDescriptor {
  /** Stable runtime id (matches `@recoder/agent-runtimes` adapter kind). */
  readonly runtimeId: string;
  /** Human-facing display name. */
  readonly displayName: string;
  /** The A2A capabilities this runtime advertises. */
  readonly capabilities: readonly string[];
  /** Optional docs/home url advertised on the card. */
  readonly url?: string;
}

/** The A2A method every coding-agent runtime supports as a dispatch target. */
export const RUNTIME_BASE_CAPABILITIES: readonly string[] = ['message/send', 'tasks/get', 'tasks/cancel'];

/** Build the advertised agent-card for a runtime descriptor. */
export function runtimeCard(descriptor: RuntimeConnectorDescriptor): AgentCard {
  return {
    id: `runtime:${descriptor.runtimeId}`,
    name: descriptor.displayName,
    description: `${descriptor.displayName} coding-agent runtime (A2A dispatch target).`,
    url: descriptor.url,
    capabilities: [...RUNTIME_BASE_CAPABILITIES, ...descriptor.capabilities],
  };
}

/** Project a runtime descriptor into a registry upsert input for an owner. */
export function toUpsertAgentInput(descriptor: RuntimeConnectorDescriptor, userId: string): UpsertAgentInput {
  return {
    id: `runtime:${descriptor.runtimeId}`,
    userId,
    kind: 'runtime',
    runtimeId: descriptor.runtimeId,
    card: runtimeCard(descriptor),
    // Registered runtimes start `unknown`; a real launch/heartbeat proves liveness.
    status: 'unknown',
  };
}
