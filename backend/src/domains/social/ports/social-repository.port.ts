/**
 * `SocialRepository` — the data-access contract for connectors, allowlist
 * bindings, and the inbound audit log. Implemented by
 * `adapters/social-repository.adapter.ts` over the persistence `QueryExecutor`
 * with `:param` SQL + app-layer tenancy (`WHERE user_id = :user_id`).
 *
 * The `wasSeen` / `recordInbound` pair is the replay/idempotency guard: one
 * provider message is processed exactly once (backed by the
 * `uq_inbound_dedup(connector_id, provider_msg)` unique index).
 */
import type {
  ChannelBinding,
  ChannelId,
  ConnectorRow,
  InboundLogEntry,
} from '../types.js';

/** Input to upsert a connector row. */
export interface UpsertConnectorInput {
  readonly id: string;
  readonly channel: ChannelId;
  readonly enabled: boolean;
  readonly secretRef?: string | null;
  readonly status?: 'up' | 'down' | 'degraded';
}

/** Input to upsert an allowlist binding. */
export interface UpsertBindingInput {
  readonly id: string;
  readonly connectorId: string;
  readonly userId: string;
  readonly spaceId?: string | null;
  readonly chatRef: string;
  readonly allow: boolean;
  readonly agentId?: string | null;
}

export interface SocialRepository {
  /** Register/update a connector row. */
  upsertConnector(input: UpsertConnectorInput): Promise<ConnectorRow>;
  /** All connector rows (read model for health/edge). */
  listConnectors(): Promise<readonly ConnectorRow[]>;
  /** Bind (or revoke via `allow:false`) an allowlisted chat_ref. */
  upsertBinding(input: UpsertBindingInput): Promise<ChannelBinding>;
  /** All bindings visible to an owner. */
  listBindings(userId: string): Promise<readonly ChannelBinding[]>;
  /** The binding for a connector+chat_ref, or `null` (⇒ hostile-by-default drop). */
  getBinding(connectorId: string, chatRef: string): Promise<ChannelBinding | null>;
  /** Remove a binding. */
  removeBinding(connectorId: string, chatRef: string, userId: string): Promise<boolean>;
  /** Record an inbound delivery + its gate decision (audit + dedup). */
  recordInbound(entry: InboundLogEntry): Promise<void>;
  /** Whether a provider message was already processed (replay guard). */
  wasSeen(connectorId: string, providerMsg: string): Promise<boolean>;
}
