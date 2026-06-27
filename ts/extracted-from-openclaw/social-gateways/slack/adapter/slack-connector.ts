// Owned by Recoder. The Slack ConnectorPort implementation — the slack row of
// the uniform connector contract (interop §4, §7.4). It wraps the real Slack
// SDK paths (ported from the extracted `social-gateways/slack/*`) behind the
// single foundation port: monitor inbound (Bolt socket/http) → normalize, send
// /react outbound (`@slack/web-api`), probe health (`auth.test`), multi-account
// via the auth-profiles store. Hostile-by-default: the port never decides
// whether to act — it emits normalized messages and lets the gating layer gate.

import type {
  ConnectorKind,
  ConnectorMonitorHandle,
  ConnectorPort,
  ConnectorProbeResult,
  InboundHandler,
  NormalizedInboundMessage,
  OutboundMessage,
  ReactionRequest,
  SendResult,
} from "../../../src/connector/index.js";
import {
  SlackAuthProfileStore,
  type SlackAuthProfile,
} from "./auth-profiles.js";
import { monitorSlackAccount } from "./monitor.js";
import { normalizeSlackEvent } from "./normalize.js";
import { probeSlack } from "./probe.js";
import { reactSlackMessage } from "./react.js";
import { sendSlackMessage } from "./send.js";
import { createSlackWebClient, type SlackWebClient } from "./web-client.js";

export interface SlackConnectorOptions {
  /** Initial Slack auth profiles (the auth-profiles foundation supplies these). */
  readonly profiles?: readonly SlackAuthProfile[];
  /** Optional logger for operator-facing diagnostics. */
  readonly log?: (message: string) => void;
  /** Optional sink for inbound handler / monitor errors. */
  readonly onError?: (error: unknown) => void;
  /**
   * Optional WebClient factory override (used by tests to inject a client).
   * Defaults to the real lazy `@slack/web-api` loader.
   */
  readonly clientFactory?: (token: string) => Promise<SlackWebClient>;
}

/**
 * Recoder's Slack connector. One instance fronts all configured Slack accounts;
 * each `monitor`/`send`/`probe`/`react` call resolves the right account's
 * credentials from the auth-profiles store.
 */
export class SlackConnector implements ConnectorPort {
  readonly kind: ConnectorKind = "slack";

  private readonly profiles: SlackAuthProfileStore;
  private readonly log?: (message: string) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly clientFactory: (token: string) => Promise<SlackWebClient>;
  /** Per-account bot user id learned at monitor start, used by normalize(). */
  private readonly botUserIds = new Map<string, string>();

  constructor(options: SlackConnectorOptions = {}) {
    this.profiles = new SlackAuthProfileStore(options.profiles ?? []);
    this.log = options.log;
    this.onError = options.onError;
    this.clientFactory = options.clientFactory ?? createSlackWebClient;
  }

  /** Register or replace a Slack account profile at runtime. */
  upsertProfile(profile: SlackAuthProfile): void {
    this.profiles.upsert(profile);
  }

  /** List all configured Slack account ids. */
  listAccountIds(): string[] {
    return this.profiles.listAccountIds();
  }

  async monitor(
    accountId: string,
    onMessage: InboundHandler,
  ): Promise<ConnectorMonitorHandle> {
    const account = this.profiles.resolve(accountId);
    if (!account.enabled) {
      throw new Error(`Slack account "${account.accountId}" is disabled; cannot monitor.`);
    }
    const handle = await monitorSlackAccount({
      account,
      onMessage,
      log: this.log,
      onError: this.onError,
    });
    return handle;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const { token, resolved } = this.profiles.requireBotToken(message.target.accountId);
    const client = await this.clientFactory(token);
    return sendSlackMessage({
      client,
      message,
      textChunkLimit: resolved.textChunkLimit,
    });
  }

  async probe(accountId: string): Promise<ConnectorProbeResult> {
    const checkedAt = Date.now();
    const account = this.profiles.resolve(accountId);
    if (!account.botToken) {
      return {
        channel: "slack",
        accountId: account.accountId,
        ready: false,
        error: `no bot token configured for account "${account.accountId}"`,
        checkedAt,
      };
    }
    try {
      const client = await this.clientFactory(account.botToken);
      const outcome = await probeSlack(client);
      return {
        channel: "slack",
        accountId: account.accountId,
        ready: outcome.ok,
        identity: outcome.identity,
        error: outcome.ok ? undefined : outcome.error,
        checkedAt,
      };
    } catch (err) {
      return {
        channel: "slack",
        accountId: account.accountId,
        ready: false,
        error: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  normalize(
    rawEvent: unknown,
    accountId: string,
  ): NormalizedInboundMessage | undefined {
    const resolved = this.profiles.resolve(accountId);
    return normalizeSlackEvent(rawEvent, resolved.accountId, {
      botUserId: this.botUserIds.get(resolved.accountId),
    });
  }

  async react(request: ReactionRequest): Promise<boolean> {
    const { token } = this.profiles.requireBotToken(request.accountId);
    const client = await this.clientFactory(token);
    return reactSlackMessage(client, request);
  }
}

/** Factory mirroring the create<Channel>Connector convention. */
export function createSlackConnector(options: SlackConnectorOptions = {}): SlackConnector {
  return new SlackConnector(options);
}
