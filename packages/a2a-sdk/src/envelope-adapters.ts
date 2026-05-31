/**
 * Legacy envelope adapters.
 *
 * Recoder PM/Agency historically exchange a camelCase "RecoderA2AEnvelope"
 * (messageId/threadId/from/to/intent) that predates the canonical
 * `TaskEnvelope` (1.0.0). This adapter maps that legacy shape onto the
 * canonical envelope so those surfaces can move onto the shared ingress
 * contract WITHOUT a breaking wire-format migration.
 *
 * The adapter only renames/relocates fields. It never invents provenance:
 * fields the legacy shape lacks (notably `workspace_id`) must be supplied by
 * the caller, which knows its own workspace/connector context.
 */

import { createTaskEnvelope } from './schemas/task-envelope';
import type { TaskEnvelope, TaskState } from './schemas/task-envelope';
import type {
  A2AProtocolKind,
  RecoderAgentPlatform,
  RecoderPayload,
} from './schemas/types';

/** Structural subset of a legacy RecoderA2AEnvelope needed to adapt it. */
export interface LegacyInboundEnvelope {
  envelopeVersion?: string;
  protocolVersion?: string;
  messageId: string;
  threadId: string;
  createdAt?: string;
  from: { id: string; platform: string; name?: string; instanceId?: string };
  to: { id: string; platform: string; name?: string; instanceId?: string };
  intent?: string;
  payload: unknown[];
  metadata?: Record<string, unknown>;
  trace?: { traceId?: string; parentMessageId?: string };
}

export interface AdaptLegacyEnvelopeOptions {
  /** Workspace the envelope belongs to. The legacy shape has none, so it is required. */
  workspaceId: string;
  /** Connector protocol. Defaults to 'a2a'. */
  protocol?: A2AProtocolKind;
  /** Connector id. Defaults to the assignee's id. */
  connectorId?: string;
  /** Initial task state. Inbound envelopes are new tasks, so defaults to 'submitted'. */
  state?: TaskState;
  /** Timestamp used when the legacy `createdAt` is absent. */
  now?: string;
}

/**
 * Map a legacy `RecoderA2AEnvelope`-shaped value onto a canonical `TaskEnvelope`.
 *
 * Field mapping: messageId→id, threadId→thread_id, trace.traceId→trace_id
 * (falls back to messageId), trace.parentMessageId→parent_id, from→requester,
 * to→assignee. `intent` and legacy version strings are preserved in `metadata`
 * so nothing is lost. The result still needs validation
 * (`normalizeInboundEnvelope`) — notably, agent platforms must be in the
 * canonical set the validator accepts.
 */
export function adaptLegacyEnvelopeToTaskEnvelope(
  legacy: LegacyInboundEnvelope,
  options: AdaptLegacyEnvelopeOptions,
): TaskEnvelope {
  return createTaskEnvelope({
    id: legacy.messageId,
    workspace_id: options.workspaceId,
    thread_id: legacy.threadId,
    trace_id: legacy.trace?.traceId ?? legacy.messageId,
    parent_id: legacy.trace?.parentMessageId,
    requester: {
      agent_id: legacy.from.id,
      platform: legacy.from.platform as RecoderAgentPlatform,
      name: legacy.from.name,
      instance_id: legacy.from.instanceId,
    },
    assignee: {
      agent_id: legacy.to.id,
      platform: legacy.to.platform as RecoderAgentPlatform,
      name: legacy.to.name,
      instance_id: legacy.to.instanceId,
    },
    connector: {
      platform: legacy.to.platform as RecoderAgentPlatform,
      protocol: options.protocol ?? 'a2a',
      connector_id: options.connectorId ?? legacy.to.id,
    },
    payload: legacy.payload as RecoderPayload | RecoderPayload[],
    initial_state: options.state ?? 'submitted',
    metadata: {
      ...legacy.metadata,
      ...(legacy.intent ? { intent: legacy.intent } : {}),
      ...(legacy.protocolVersion ? { legacyProtocolVersion: legacy.protocolVersion } : {}),
      ...(legacy.envelopeVersion ? { legacyEnvelopeVersion: legacy.envelopeVersion } : {}),
    },
    now: legacy.createdAt ?? options.now,
  });
}
