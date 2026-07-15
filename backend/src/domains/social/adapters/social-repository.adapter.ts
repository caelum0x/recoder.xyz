/**
 * `PgSocialRepository` — the {@link SocialRepository} impl over the persistence
 * {@link QueryExecutor} (`connectors` + `channel_bindings` + `inbound_messages`).
 *
 * All access is parameterized `:param` SQL with app-layer tenancy
 * (`WHERE user_id = :user_id`) — NO Supabase RLS. The `recordInbound` INSERT is
 * `ON CONFLICT DO NOTHING` against `uq_inbound_dedup`, so a replayed provider
 * message is a silent no-op (idempotent), and `wasSeen` is the fast dedup probe.
 *
 * DEGRADE-SAFE: when `executor.isAvailable()` is false the repo serves from a
 * bounded in-process store and never fabricates a persisted row.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  SocialRepository,
  UpsertBindingInput,
  UpsertConnectorInput,
} from '../ports/social-repository.port.js';
import type { ChannelBinding, ChannelId, ConnectorRow, InboundLogEntry } from '../types.js';

export interface SocialRepositoryDeps {
  readonly executor: QueryExecutor;
}

function rowToConnector(row: QueryRow): ConnectorRow {
  return {
    id: String(row.id),
    channel: row.channel as ChannelId,
    enabled: Boolean(row.enabled),
    secretRef: row.secret_ref == null ? undefined : String(row.secret_ref),
    status: (row.status as ConnectorRow['status']) ?? 'down',
  };
}

function rowToBinding(row: QueryRow): ChannelBinding {
  return {
    id: String(row.id),
    connectorId: String(row.connector_id),
    userId: String(row.user_id),
    spaceId: row.space_id == null ? undefined : String(row.space_id),
    chatRef: String(row.chat_ref),
    allow: Boolean(row.allow),
    agentId: row.agent_id == null ? undefined : String(row.agent_id),
  };
}

/** Build the social repository over the persistence executor. */
export function createSocialRepository(deps: SocialRepositoryDeps): SocialRepository {
  const { executor } = deps;
  const memConnectors = new Map<string, ConnectorRow>();
  const memBindings = new Map<string, ChannelBinding>(); // key: connectorId|chatRef
  const memInbound = new Set<string>(); // key: connectorId|providerMsg
  const durable = (): boolean => executor.isAvailable();
  const bindKey = (c: string, r: string): string => `${c}|${r}`;

  async function upsertConnector(input: UpsertConnectorInput): Promise<ConnectorRow> {
    const row: ConnectorRow = {
      id: input.id,
      channel: input.channel,
      enabled: input.enabled,
      secretRef: input.secretRef ?? undefined,
      status: input.status ?? 'down',
    };
    memConnectors.set(input.id, row);
    if (!durable()) return row;
    await executor.mutate(
      `insert into connectors (id, channel, enabled, secret_ref, status, created_at, updated_at)
       values (:id, :channel, :enabled, :secret_ref, :status, now(), now())
       on conflict (id) do update set
         channel = excluded.channel,
         enabled = excluded.enabled,
         secret_ref = excluded.secret_ref,
         status = excluded.status,
         updated_at = now()`,
      {
        id: input.id,
        channel: input.channel,
        enabled: input.enabled,
        secret_ref: input.secretRef ?? null,
        status: input.status ?? 'down',
      },
    );
    return row;
  }

  async function listConnectors(): Promise<readonly ConnectorRow[]> {
    if (!durable()) return [...memConnectors.values()];
    const rows = await executor.execute<QueryRow>(`select * from connectors order by id asc`);
    return rows.map(rowToConnector);
  }

  async function upsertBinding(input: UpsertBindingInput): Promise<ChannelBinding> {
    const row: ChannelBinding = {
      id: input.id,
      connectorId: input.connectorId,
      userId: input.userId,
      spaceId: input.spaceId ?? undefined,
      chatRef: input.chatRef,
      allow: input.allow,
      agentId: input.agentId ?? undefined,
    };
    memBindings.set(bindKey(input.connectorId, input.chatRef), row);
    if (!durable()) return row;
    await executor.mutate(
      `insert into channel_bindings (id, connector_id, user_id, space_id, chat_ref, allow, agent_id, created_at)
       values (:id, :connector_id, :user_id, :space_id, :chat_ref, :allow, :agent_id, now())
       on conflict (connector_id, chat_ref) do update set
         user_id = excluded.user_id,
         space_id = excluded.space_id,
         allow = excluded.allow,
         agent_id = excluded.agent_id`,
      {
        id: input.id,
        connector_id: input.connectorId,
        user_id: input.userId,
        space_id: input.spaceId ?? null,
        chat_ref: input.chatRef,
        allow: input.allow,
        agent_id: input.agentId ?? null,
      },
    );
    return row;
  }

  async function listBindings(userId: string): Promise<readonly ChannelBinding[]> {
    if (!durable()) return [...memBindings.values()].filter((b) => b.userId === userId);
    const rows = await executor.execute<QueryRow>(
      `select * from channel_bindings where user_id = :user_id order by created_at desc`,
      { user_id: userId },
    );
    return rows.map(rowToBinding);
  }

  async function getBinding(connectorId: string, chatRef: string): Promise<ChannelBinding | null> {
    if (!durable()) return memBindings.get(bindKey(connectorId, chatRef)) ?? null;
    const rows = await executor.execute<QueryRow>(
      `select * from channel_bindings where connector_id = :connector_id and chat_ref = :chat_ref`,
      { connector_id: connectorId, chat_ref: chatRef },
    );
    return rows[0] ? rowToBinding(rows[0]) : null;
  }

  async function removeBinding(connectorId: string, chatRef: string, userId: string): Promise<boolean> {
    const key = bindKey(connectorId, chatRef);
    const existing = memBindings.get(key);
    if (existing && existing.userId === userId) memBindings.delete(key);
    if (!durable()) return Boolean(existing && existing.userId === userId);
    const affected = await executor.mutate(
      `delete from channel_bindings where connector_id = :connector_id and chat_ref = :chat_ref and user_id = :user_id`,
      { connector_id: connectorId, chat_ref: chatRef, user_id: userId },
    );
    return affected > 0;
  }

  async function recordInbound(entry: InboundLogEntry): Promise<void> {
    memInbound.add(bindKey(entry.connectorId, entry.providerMsg));
    if (!durable()) return;
    await executor.mutate(
      `insert into inbound_messages
         (id, connector_id, chat_ref, provider_msg, user_id, decision, reason, dispatch_kind, run_id, received_at)
       values
         (:id, :connector_id, :chat_ref, :provider_msg, :user_id, :decision, :reason, :dispatch_kind, :run_id, now())
       on conflict (connector_id, provider_msg) do nothing`,
      {
        id: entry.id,
        connector_id: entry.connectorId,
        chat_ref: entry.chatRef,
        provider_msg: entry.providerMsg,
        user_id: entry.userId ?? null,
        decision: entry.decision,
        reason: entry.reason ?? null,
        dispatch_kind: entry.dispatchKind ?? null,
        run_id: entry.runId ?? null,
      },
    );
  }

  async function wasSeen(connectorId: string, providerMsg: string): Promise<boolean> {
    if (!durable()) return memInbound.has(bindKey(connectorId, providerMsg));
    const rows = await executor.execute<QueryRow>(
      `select 1 as seen from inbound_messages where connector_id = :connector_id and provider_msg = :provider_msg limit 1`,
      { connector_id: connectorId, provider_msg: providerMsg },
    );
    return rows.length > 0;
  }

  return {
    upsertConnector,
    listConnectors,
    upsertBinding,
    listBindings,
    getBinding,
    removeBinding,
    recordInbound,
    wasSeen,
  };
}
