/**
 * SocialRuntime — the supervised composition of the compiled
 * @recoder/connectors surface:
 *
 *   drivers (env detection + lazy real adapters)
 *     -> ConnectorRegistry (live ports)
 *     -> monitor() ingress for self-contained channels
 *     -> makeAllowlistGatePolicy + dispatchInbound (trust boundary FIRST,
 *        then the embedded runner, then port.send)
 *
 * Degrade-safe by construction:
 *   - No configured channels => start() succeeds, status says so truthfully.
 *   - An adapter that fails to build/probe/monitor degrades to a truthful
 *     per-channel reason — never a crash, never a fake "connected".
 *   - No embedded runner (pi peers are optional + opt-in) => a gated-in message
 *     is recorded as a truthful `no-runner` outcome; nothing is sent.
 */
import {
  ConnectorRegistry,
  createPiEmbeddedRunner,
  dispatchInbound,
  makeAllowlistGatePolicy,
  resolveGate,
  type AgentRouting,
  type ConnectorKind,
  type ConnectorMonitorHandle,
  type ConnectorPort,
  type DispatchOutcome,
  type EmbeddedRunner,
  type GatePolicy,
  type NormalizedInboundMessage,
} from '@recoder/connectors';

import type { ChannelDriver } from './channels.js';
import { builtinChannelDrivers } from './channels.js';
import type { SocialConfig } from './config.js';

/**
 * Injectable host environment (the embedding contract from the package's
 * runtime reference): logging is injectable and nothing here may kill the host.
 */
export interface RuntimeEnv {
  log(message: string): void;
  error(message: string): void;
}

const silentEnv: RuntimeEnv = { log: () => {}, error: () => {} };

/** Truthful per-channel status. */
export interface ChannelStatus {
  readonly channel: ConnectorKind;
  readonly accountId: string;
  /** Genuine credentials present in env. */
  readonly configured: boolean;
  /** A real ConnectorPort was built (adapter + SDK loadable). */
  readonly available: boolean;
  /** Live inbound monitoring is running (never true unless monitor() succeeded). */
  readonly connected: boolean;
  /** Configured channel still needs an external dependency for live inbound. */
  readonly requiresExternal: boolean;
  readonly reason?: string;
}

/** Truthful record of one inbound message's terminal outcome. */
export interface InboundRecord {
  readonly at: number;
  readonly channel: ConnectorKind;
  readonly conversationId: string;
  readonly kind: 'blocked' | 'no-runner' | 'dispatched' | 'error';
  readonly reason?: string;
  /** Package DispatchOutcome status when kind === 'dispatched'. */
  readonly outcomeStatus?: DispatchOutcome['status'];
}

export interface SocialStatus {
  readonly service: 'recoder-social';
  /** True when the runtime started AND at least one channel is live-monitoring. */
  readonly active: boolean;
  readonly agentEnabled: boolean;
  readonly channels: readonly ChannelStatus[];
  /** Most recent inbound outcomes (audit trail, newest last, capped). */
  readonly recentInbound: readonly InboundRecord[];
}

export interface SocialRuntimeDeps {
  /** Channel drivers (default: the eight real @recoder/connectors drivers). */
  readonly drivers?: readonly ChannelDriver[];
  /**
   * Embedded reply runner. Default: the real pi runner when config.agent.enabled
   * (pi peers load lazily on first run), else null => truthful no-runner mode.
   */
  readonly runner?: EmbeddedRunner | null;
  readonly env?: RuntimeEnv;
}

const MAX_INBOUND_RECORDS = 50;

export class SocialRuntime {
  private readonly config: SocialConfig;
  private readonly drivers: readonly ChannelDriver[];
  private readonly runner: EmbeddedRunner | null;
  private readonly env: RuntimeEnv;
  private readonly registry = new ConnectorRegistry();
  private readonly gatePolicy: GatePolicy;
  private statuses = new Map<ConnectorKind, ChannelStatus>();
  private monitors: ConnectorMonitorHandle[] = [];
  private inbound: InboundRecord[] = [];
  private started = false;

  constructor(config: SocialConfig, deps: SocialRuntimeDeps = {}) {
    this.config = config;
    this.drivers = deps.drivers ?? builtinChannelDrivers();
    this.env = deps.env ?? silentEnv;
    this.runner =
      deps.runner !== undefined
        ? deps.runner
        : config.agent.enabled
          ? createPiEmbeddedRunner()
          : null;
    // The SAME trust boundary the backend bridge applies: allowlist is
    // the sole authorization source, DMs are NOT silently open, `/`-prefixed
    // text counts as a control command, empty allowlist authorizes nobody.
    this.gatePolicy = makeAllowlistGatePolicy({
      allowlist: config.gating.allowlist,
      requireMentionInGroups: config.gating.requireMention,
      directMessagesAllowed: false,
      canDetectMention: true,
      allowTextCommands: true,
      commandPrefixes: ['/'],
      useAccessGroups: false,
    });
  }

  /** Start every candidate channel. Never throws; failures degrade per-channel. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const filter = this.config.channelFilter;
    const candidates =
      filter.length > 0 ? this.drivers.filter((d) => filter.includes(d.channel)) : this.drivers;

    for (const driver of candidates) {
      this.statuses.set(driver.channel, await this.startChannel(driver));
    }

    const configured = [...this.statuses.values()].filter((s) => s.configured);
    if (configured.length === 0) {
      this.env.log('social: no channels configured — serving truthful status only');
    }
  }

  private async startChannel(driver: ChannelDriver): Promise<ChannelStatus> {
    const base = {
      channel: driver.channel,
      accountId: driver.channel as string,
      requiresExternal: driver.requiresExternal,
    };

    let detection;
    try {
      detection = driver.detect();
    } catch (err) {
      return {
        ...base,
        configured: false,
        available: false,
        connected: false,
        reason: `detection failed: ${errorMessage(err)}`,
      };
    }
    if (!detection.configured) {
      return {
        ...base,
        configured: false,
        available: false,
        connected: false,
        reason: detection.reason ?? 'not configured',
      };
    }

    const accountId = detection.accountId ?? driver.channel;
    let port: ConnectorPort;
    try {
      port = await driver.create(detection);
    } catch (err) {
      return {
        ...base,
        accountId,
        configured: true,
        available: false,
        connected: false,
        reason: `adapter unavailable: ${errorMessage(err)}`,
      };
    }
    this.registry.register(port);

    if (driver.requiresExternal) {
      // Port is real (send/probe work); inbound is truthfully not live here.
      return {
        ...base,
        accountId,
        configured: true,
        available: true,
        connected: false,
        reason: detection.reason ?? 'configured; live inbound needs an external dependency',
      };
    }

    try {
      // InboundHandler may return a promise; hand ours back so ingress loops
      // that await their handler observe the full dispatch (tests rely on it).
      const handle = await port.monitor(accountId, async (message) => {
        await this.ingestInbound(message);
      });
      this.monitors = [...this.monitors, handle];
      return { ...base, accountId, configured: true, available: true, connected: true };
    } catch (err) {
      return {
        ...base,
        accountId,
        configured: true,
        available: true,
        connected: false,
        reason: `monitor failed: ${errorMessage(err)}`,
      };
    }
  }

  /**
   * Run one normalized inbound message through the trust boundary and (when a
   * runner exists) the package's full dispatch pipeline. Never throws.
   */
  async ingestInbound(message: NormalizedInboundMessage): Promise<InboundRecord> {
    let record: InboundRecord;
    if (!this.runner) {
      // No embedded runner: still run the SAME gate, then report truthfully that
      // an authorized message had no agent to answer it (nothing is sent).
      record = await this.gateOnly(message);
    } else {
      try {
        const outcome = await dispatchInbound(message, {
          registry: this.registry,
          runner: this.runner,
          gatePolicy: this.gatePolicy,
          agentRouter: (m): AgentRouting => ({
            agentId: this.config.agent.agentId,
            sessionId: `${m.channel}:${m.conversationId}`,
            ...(this.config.agent.model ? { model: this.config.agent.model } : {}),
          }),
        });
        record = {
          at: Date.now(),
          channel: message.channel,
          conversationId: message.conversationId,
          kind: outcome.status === 'blocked' ? 'blocked' : 'dispatched',
          outcomeStatus: outcome.status,
          ...(outcome.status !== 'delivered' ? { reason: outcome.reason } : {}),
        };
      } catch (err) {
        // dispatchInbound is contractually non-throwing; this is belt-and-braces.
        record = {
          at: Date.now(),
          channel: message.channel,
          conversationId: message.conversationId,
          kind: 'error',
          reason: errorMessage(err),
        };
      }
    }
    this.inbound = [...this.inbound, record].slice(-MAX_INBOUND_RECORDS);
    if (record.kind === 'blocked') {
      this.env.log(`social: inbound blocked (${message.channel}): ${record.reason ?? 'gated'}`);
    } else if (record.kind === 'no-runner') {
      this.env.log(`social: inbound accepted but no embedded runner (${message.channel}) — nothing sent`);
    } else if (record.reason) {
      this.env.error(`social: inbound ${record.kind} (${message.channel}): ${record.reason}`);
    }
    return record;
  }

  private async gateOnly(message: NormalizedInboundMessage): Promise<InboundRecord> {
    const at = Date.now();
    const base = { at, channel: message.channel, conversationId: message.conversationId };
    try {
      const decision = resolveGate(await this.gatePolicy(message));
      if (decision.blocked) {
        return { ...base, kind: 'blocked', reason: decision.reason ?? 'blocked by connector trust boundary' };
      }
      return {
        ...base,
        kind: 'no-runner',
        reason:
          'message authorized, but no embedded runner is configured (set CONNECTORS_AGENT_ENABLED=true and install the optional pi peers) — nothing was sent',
      };
    } catch (err) {
      return { ...base, kind: 'error', reason: `gate policy failed: ${errorMessage(err)}` };
    }
  }

  /** Truthful snapshot of the whole runtime. */
  status(): SocialStatus {
    const channels = [...this.statuses.values()];
    return {
      service: 'recoder-social',
      active: this.started && channels.some((c) => c.connected),
      agentEnabled: this.runner !== null,
      channels,
      recentInbound: [...this.inbound],
    };
  }

  /** Stop all channel monitors. Never throws. */
  async stop(): Promise<void> {
    const monitors = this.monitors;
    this.monitors = [];
    for (const handle of monitors) {
      try {
        await handle.stop();
      } catch (err) {
        this.env.error(`social: monitor stop failed: ${errorMessage(err)}`);
      }
    }
    // Downgrade connected flags truthfully after stop.
    this.statuses = new Map(
      [...this.statuses.entries()].map(([channel, s]) => [
        channel,
        s.connected ? { ...s, connected: false, reason: 'stopped' } : s,
      ]),
    );
    this.started = false;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
