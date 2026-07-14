/**
 * Connectors gateway — the live bridge between a chat channel and the Conductor.
 *
 * INBOUND:  a normalized channel message  -> trust-boundary gate (allowlist +
 *           mention + command) -> parse the command -> createWorkspace() in the
 *           SAME process as every other Conductor launch (workspace-service is
 *           the single dispatch path; this never reimplements it).
 * OUTBOUND: poll the workspace's persisted state + run events and post concise
 *           status updates back to the originating conversation via send().
 *
 * Hostile-by-default: a message that fails gating produces NO control-plane
 * action. Degrade-safe: if no channel is configured the gateway stays inert.
 */
import { resolveGate, type ConnectorPort, type ConnectorMonitorHandle, type NormalizedInboundMessage, type ConnectorProbeResult } from '@recoder/connectors';
import type { Workspace } from '@recoder/agent-os';
import { createLogger } from '../logger';
import { createWorkspace, getWorkspace } from '../conductor/workspace-service.js';
import { loadConnectorsConfig, type ChannelConfig, type ConnectorsConfig } from './config.js';
import { resolveAdapterFactory } from './channel-adapters.js';
import { hasWebhookSecret, WEBHOOK_INBOUND_CHANNELS } from './webhook-channels.js';
import { ConnectorAgentDispatcher, type AgentDispatchResult } from './dispatch-runner.js';
import { admitConnectorMessage } from './connector-ingress-gate.js';

const logger = createLogger('connectors:gateway');

/** How long to follow a launched workspace before giving up on status polling. */
const STATUS_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_MAX_MS = 30 * 60_000; // 30 minutes

/** Per-channel live state for truthful health reporting. */
interface ChannelRuntime {
  readonly config: ChannelConfig;
  /** The real ConnectorPort, lazily built behind the optional-SDK loader. */
  port?: ConnectorPort;
  handle?: ConnectorMonitorHandle;
  /** Last probe result — never faked; only set after a real probe(). */
  lastProbe?: ConnectorProbeResult;
  /** Set when the adapter subpath / SDK could not be loaded (truthful unavailability). */
  buildError?: string;
}

export interface ChannelHealth {
  readonly channel: string;
  readonly accountId: string;
  /** Credentials present in env (so this channel was instantiated). */
  readonly configured: boolean;
  /** The adapter port was built and its inbound monitor is available. */
  readonly available: boolean;
  /** A real probe() reported the account reachable + authorized. */
  readonly connected: boolean;
  /**
   * Configured but needs an external dependency (HTTP ingress / bridge / daemon)
   * to take inbound LIVE. The port still registers; this flags the gap truthfully.
   */
  readonly requiresExternal: boolean;
  readonly identity?: string;
  /** When NOT configured: why. When requiresExternal: the missing dependency. */
  readonly reason?: string;
  readonly error?: string;
  readonly checkedAt?: number;
}

export interface ConnectorsHealth {
  /** True when at least one channel is configured (gateway is not inert). */
  readonly active: boolean;
  /** Whether inbound commands can launch a workspace (dispatch is configured). */
  readonly dispatchReady: boolean;
  readonly channels: readonly ChannelHealth[];
}

/** The terminal-ish states we report a final status for, then stop polling. */
function isFinalState(state: Workspace['state']): boolean {
  return (
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'merged' ||
    state === 'archived' ||
    state === 'awaiting_review' ||
    state === 'awaiting_approval'
  );
}

export class ConnectorsGateway {
  private readonly config: ConnectorsConfig;
  private readonly runtimes: ChannelRuntime[] = [];
  private started = false;
  /**
   * Set true once the in-process HTTP webhook ingress route has registered
   * itself with this gateway. Until then, push-only channels truthfully report
   * `requiresExternal` (config alone cannot take their inbound live).
   */
  private webhookIngressActive = false;
  /**
   * The embedded-agent dispatcher (normalize -> gate -> pi-agent runner ->
   * port.send via the package's real `dispatchInbound`). Built lazily so it sees
   * the live, configured ports. Degrade-safe: when the embedded runner is not
   * enabled it returns a truthful no-runner result and sends nothing.
   */
  private agentDispatcher?: ConnectorAgentDispatcher;

  constructor(config: ConnectorsConfig = loadConnectorsConfig()) {
    this.config = config;
    // One runtime per CONFIGURED channel (credentials present). Ports are built
    // lazily in start() behind the optional-SDK loader so a missing channel SDK
    // degrades to a truthful buildError, never a constructor throw.
    for (const channel of config.channels) {
      this.runtimes.push({ config: channel });
    }
  }

  /** True when at least one channel was configured (credentials present). */
  get active(): boolean {
    return this.runtimes.length > 0;
  }

  /**
   * Mark the in-process HTTP webhook ingress as mounted. Called once by the
   * webhook route registration so health reports push-only channels (line/slack)
   * as live-inbound-capable. Idempotent + truthful: it only affects channels
   * that both belong to {@link WEBHOOK_INBOUND_CHANNELS} and have their secret.
   */
  markWebhookIngressActive(): void {
    this.webhookIngressActive = true;
  }

  /** Whether the in-process webhook ingress has been mounted. */
  get hasWebhookIngress(): boolean {
    return this.webhookIngressActive;
  }

  /**
   * Built (or buildable) ConnectorPort for a configured channel, used by the
   * webhook ingress to run the channel's REAL normalize() on a verified event.
   * Returns null when the channel is not configured or its port failed to build.
   */
  getChannelPort(channel: string): ConnectorPort | null {
    const runtime = this.runtimes.find((r) => r.config.channel === channel);
    return runtime?.port ?? null;
  }

  /** Resolved config for a configured channel (or null). */
  getChannelConfig(channel: string): ChannelConfig | null {
    return this.runtimes.find((r) => r.config.channel === channel)?.config ?? null;
  }

  /**
   * Lazily build the embedded-agent dispatcher. The gateway itself is the
   * `PortSource` (it owns the live, configured ports), so the dispatcher delivers
   * a reply over the SAME real port the inbound arrived on. Built once and reused.
   */
  private getAgentDispatcher(): ConnectorAgentDispatcher {
    if (!this.agentDispatcher) {
      this.agentDispatcher = new ConnectorAgentDispatcher({
        ports: this,
        gating: this.config.gating,
      });
    }
    return this.agentDispatcher;
  }

  /** True when an embedded reply agent will actually answer in-channel. */
  get embeddedAgentReady(): boolean {
    return this.getAgentDispatcher().ready;
  }

  /** True when dispatch is configured (an inbound command can launch a workspace). */
  get dispatchReady(): boolean {
    return Boolean(this.config.dispatch);
  }

  /**
   * Build the real ConnectorPort for a configured channel from its
   * @recoder/connectors adapter subpath, behind the optional-SDK loader. Records
   * a truthful buildError (and returns null) when the subpath/SDK is unavailable.
   */
  private async buildPort(runtime: ChannelRuntime): Promise<ConnectorPort | null> {
    const factory = resolveAdapterFactory(runtime.config.channel);
    if (!factory) {
      runtime.buildError = `no adapter registered for ${runtime.config.channel}`;
      return null;
    }
    try {
      const port = await factory({
        configured: true,
        token: runtime.config.token,
        accountId: runtime.config.accountId,
      });
      runtime.port = port;
      runtime.buildError = undefined;
      return port;
    } catch (err) {
      runtime.buildError = err instanceof Error ? err.message : 'adapter build failed';
      return null;
    }
  }

  /** Start ingress for every configured channel. Inert + safe when none. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (!this.active) {
      logger.info('connectors: no channels configured');
      return;
    }
    for (const runtime of this.runtimes) {
      try {
        const port = await this.buildPort(runtime);
        if (!port) {
          logger.warn(
            { channel: runtime.config.channel, err: runtime.buildError },
            'connectors channel adapter unavailable (degrading truthfully)',
          );
          runtime.lastProbe = {
            channel: runtime.config.channel,
            accountId: runtime.config.accountId,
            ready: false,
            error: runtime.buildError ?? 'adapter unavailable',
            checkedAt: Date.now(),
          };
          continue;
        }
        // Probe first so health is truthful even before the first message.
        runtime.lastProbe = await port.probe(runtime.config.accountId);
        runtime.handle = await port.monitor(runtime.config.accountId, (message) =>
          this.handleInbound(runtime, message),
        );
        logger.info(
          {
            channel: runtime.config.channel,
            ready: runtime.lastProbe?.ready,
            identity: runtime.lastProbe?.identity,
            requiresExternal: runtime.config.requiresExternal,
          },
          'connectors channel monitoring',
        );
      } catch (err) {
        // A single channel failing must never crash the others or boot.
        logger.error({ channel: runtime.config.channel, err }, 'connectors channel failed to start');
        runtime.lastProbe = {
          channel: runtime.config.channel,
          accountId: runtime.config.accountId,
          ready: false,
          error: err instanceof Error ? err.message : 'start failed',
          checkedAt: Date.now(),
        };
      }
    }
  }

  /** Stop ingress for every channel (used on shutdown / tests). */
  async stop(): Promise<void> {
    await Promise.all(
      this.runtimes.map(async (r) => {
        try {
          await r.handle?.stop();
        } catch (err) {
          logger.warn({ channel: r.config.channel, err }, 'connectors channel stop failed');
        }
      }),
    );
    this.started = false;
  }

  /** Truthful per-channel health — re-probes each configured channel live. */
  async health(): Promise<ConnectorsHealth> {
    // Configured channels (credentials present): report build/probe truthfully.
    const configured = await Promise.all(
      this.runtimes.map(async (r): Promise<ChannelHealth> => {
        let probe = r.lastProbe;
        if (r.port) {
          try {
            probe = await r.port.probe(r.config.accountId);
            r.lastProbe = probe;
          } catch (err) {
            probe = {
              channel: r.config.channel,
              accountId: r.config.accountId,
              ready: false,
              error: err instanceof Error ? err.message : 'probe failed',
              checkedAt: Date.now(),
            };
          }
        }
        // Push-only channels (line/slack HTTP Events) are no longer
        // `requiresExternal` once the in-process webhook ingress is mounted AND
        // the channel has its webhook verification secret — inbound is then LIVE
        // in-process. Degrade-safe: with no ingress, or no secret, they stay
        // truthfully `requiresExternal`.
        const liveViaWebhook =
          this.webhookIngressActive &&
          WEBHOOK_INBOUND_CHANNELS.has(r.config.channel) &&
          hasWebhookSecret(r.config.channel);
        const requiresExternal = r.config.requiresExternal && !liveViaWebhook;
        return {
          channel: r.config.channel,
          accountId: r.config.accountId,
          configured: true,
          available: Boolean(r.port),
          connected: probe?.ready === true,
          requiresExternal,
          identity: probe?.identity,
          reason: liveViaWebhook
            ? 'configured; live inbound via in-process HTTP webhook ingress'
            : r.config.note,
          error: probe?.error ?? r.buildError,
          checkedAt: probe?.checkedAt,
        };
      }),
    );

    // Unconfigured channels (no credentials): truthful configured:false, with the
    // reason (which env var is missing). These never registered or touched a network.
    const unconfigured: ChannelHealth[] = this.config.unconfigured.map((u) => ({
      channel: u.channel,
      accountId: u.channel,
      configured: false,
      available: false,
      connected: false,
      requiresExternal: false,
      reason: u.reason,
    }));

    return {
      active: this.active,
      dispatchReady: Boolean(this.config.dispatch),
      channels: [...configured, ...unconfigured],
    };
  }

  /** Decide whether the message is on the allowlist (literal "*" = allow-all). */
  private isAllowlisted(message: NormalizedInboundMessage): boolean {
    const list = this.config.gating.allowlist;
    if (list.includes('*')) return true;
    if (list.length === 0) return false; // hostile-by-default
    const candidates = [message.sender.SenderId, message.sender.SenderUsername]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((v) => v.toLowerCase());
    const normalizedList = list.map((v) => v.replace(/^@/, '').toLowerCase());
    return candidates.some((c) => normalizedList.includes(c.replace(/^@/, '')));
  }

  /**
   * Ingest a normalized inbound message that arrived via the HTTP webhook
   * ingress (push-only channels: line, slack). It resolves the channel's live
   * runtime and runs the EXACT same trust-boundary gate -> dispatch ->
   * createWorkspace path as a long-poll/socket message — the webhook is just a
   * different transport, never a different control path. Returns true when the
   * message reached the gate (regardless of the gate decision), false when the
   * channel is not configured/built (so the route can report truthfully).
   */
  async ingestInbound(channel: string, message: NormalizedInboundMessage): Promise<boolean> {
    const runtime = this.runtimes.find((r) => r.config.channel === channel);
    if (!runtime) return false;
    await this.handleInbound(runtime, message);
    return true;
  }

  /**
   * Run a VERIFIED inbound message straight through the embedded-agent dispatch
   * (the package's real `dispatchInbound`: normalize -> gate -> pi-agent runner
   * -> port.send) and return the truthful result. Used by the verified webhook
   * ingress (and tests) to observe the genuine `DispatchOutcome` — a blocked
   * message yields a `blocked` outcome and NO send; an unconfigured runner yields
   * a truthful no-runner result (never a fake delivered). Returns null when the
   * channel is not a configured runtime (so the caller can report truthfully).
   */
  async dispatchEmbeddedAgent(
    channel: string,
    message: NormalizedInboundMessage,
  ): Promise<AgentDispatchResult | null> {
    const runtime = this.runtimes.find((r) => r.config.channel === channel);
    if (!runtime) return null;
    return this.runEmbeddedAgent(message);
  }

  /**
   * Handle one gated-or-not inbound message: run the trust boundary, and only on
   * a clean pass launch a real workspace and follow its status.
   */
  private async handleInbound(runtime: ChannelRuntime, message: NormalizedInboundMessage): Promise<void> {
    // Hostile-by-default signed edge BEFORE the workspace loop: when an ingress
    // secret is configured, the gateway seals the (channel-verified, gated)
    // message into a canonical signed envelope and re-admits it through the OWNED
    // @recoder/interop connector-ingress gate. A rejected envelope is DROPPED here
    // — it never reaches dispatch/createWorkspace. Degrade-safe: with no secret
    // the gate is inert and the message proceeds exactly as before.
    const admission = admitConnectorMessage(message);
    if (admission.kind === 'rejected') {
      logger.warn(
        {
          channel: runtime.config.channel,
          stage: admission.stage,
          code: admission.code,
          reason: admission.reason,
        },
        'connectors message rejected by signed ingress gate',
      );
      return;
    }

    const isGroup = message.chatType !== 'direct';
    const command = this.parseCommand(message.text);

    const decision = resolveGate({
      allowlisted: this.isAllowlisted(message),
      isGroup,
      requireMention: this.config.gating.requireMention,
      canDetectMention: true,
      wasMentioned: message.wasMentioned,
      hasAnyMention: message.wasMentioned,
      allowTextCommands: true,
      hasControlCommand: command !== null,
      useAccessGroups: false,
      authorizers: [],
    });

    if (decision.blocked) {
      logger.info({ channel: runtime.config.channel, reason: decision.reason }, 'connectors message blocked by gate');
      return;
    }

    if (!command) {
      // Passed the gate but carried no Conductor control command. If an embedded
      // reply agent is configured, answer conversationally via the package's real
      // dispatchInbound (normalize -> gate -> runner -> send). Otherwise this is a
      // truthful no-op: nothing actionable, nothing sent.
      await this.runEmbeddedAgent(message);
      return;
    }

    if (!this.config.dispatch) {
      // A control command arrived but Conductor dispatch is not configured. When
      // an embedded reply agent IS configured, hand the message to it; otherwise
      // tell the operator truthfully that dispatch is unconfigured.
      if (this.embeddedAgentReady) {
        await this.runEmbeddedAgent(message);
        return;
      }
      await this.reply(runtime, message, 'Connectors received your command but dispatch is not configured (set CONNECTORS_REPO_PATH).');
      return;
    }

    await this.dispatch(runtime, message, command.prompt);
  }

  /**
   * Run one gated message through the embedded-agent dispatch (the package's real
   * `dispatchInbound`: re-gate -> pi-agent runner -> port.send). The agent
   * dispatcher is degrade-safe — when no embedded runner is configured it returns
   * a truthful no-runner result and this method sends nothing (never a fake
   * reply). A truthful `DispatchOutcome` is logged for auditability.
   */
  private async runEmbeddedAgent(message: NormalizedInboundMessage): Promise<AgentDispatchResult | null> {
    try {
      const result = await this.getAgentDispatcher().dispatch(message);
      if (result.kind === 'dispatched') {
        logger.info(
          { channel: message.channel, status: result.outcome.status },
          'connectors embedded-agent dispatch outcome',
        );
      } else {
        logger.debug({ channel: message.channel, kind: result.kind, reason: result.reason }, 'connectors embedded-agent not run');
      }
      return result;
    } catch (err) {
      logger.warn({ channel: message.channel, err }, 'connectors embedded-agent dispatch threw');
      return null;
    }
  }

  /**
   * Parse a control command body. Supports both the @recoder/connectors mention
   * grammar (`@agent handoff: …`) and a plain `/run <prompt>` (or bare prompt
   * after the bot is mentioned). Returns null when there is no actionable prompt.
   */
  private parseCommand(text: string): { prompt: string } | null {
    const trimmed = text.trim();
    const slash = /^\/(run|code|task)\s+([\s\S]+)$/i.exec(trimmed);
    if (slash) return { prompt: slash[2].trim() };
    // `@bot <prompt>` — strip a leading @mention token and use the remainder.
    const mention = /^@\S+\s+([\s\S]+)$/.exec(trimmed);
    if (mention) return { prompt: mention[1].trim() };
    // Direct messages with plain text are treated as a prompt.
    return trimmed.length > 0 ? { prompt: trimmed } : null;
  }

  /** Launch a real Conductor workspace for the prompt and follow its status. */
  private async dispatch(runtime: ChannelRuntime, message: NormalizedInboundMessage, prompt: string): Promise<void> {
    const dispatch = this.config.dispatch!;
    const createdBy = `connector:${message.channel}:${message.sender.SenderUsername ?? message.sender.SenderId ?? 'unknown'}`;
    const taskId = `conn_${message.channel}_${message.conversationId}_${Date.now()}`;

    // Acknowledge with a real reaction (best effort) + a started message.
    await runtime.port
      ?.react({
        channel: message.channel,
        accountId: message.accountId,
        conversationId: message.conversationId,
        messageId: message.messageId,
        emoji: '👀',
      })
      .catch(() => false);

    let workspace: Workspace;
    try {
      workspace = await createWorkspace({
        spaceId: dispatch.spaceId,
        projectId: dispatch.projectId,
        taskId,
        repoPath: dispatch.repoPath,
        runtimeId: dispatch.runtimeId,
        prompt,
        model: dispatch.model,
        createdBy,
      });
    } catch (err) {
      logger.error({ channel: message.channel, err }, 'connectors dispatch failed');
      await this.reply(runtime, message, `Failed to start agent: ${err instanceof Error ? err.message : 'unknown error'}`);
      return;
    }

    if (workspace.state === 'failed') {
      const reason = (workspace.metadata as any)?.error ?? 'provisioning failed';
      await this.reply(runtime, message, `Agent failed to start (${workspace.runtimeId}): ${reason}`);
      return;
    }

    await this.reply(
      runtime,
      message,
      `Started ${workspace.runtimeId} agent — workspace ${workspace.workspaceId} on branch ${workspace.branch}.`,
    );
    // Follow status without blocking the inbound handler.
    void this.followStatus(runtime, message, workspace.workspaceId);
  }

  /** Poll the persisted workspace state and post concise transitions back. */
  private async followStatus(
    runtime: ChannelRuntime,
    message: NormalizedInboundMessage,
    workspaceId: string,
  ): Promise<void> {
    const startedAt = Date.now();
    let lastState: Workspace['state'] | undefined;

    const tick = async (): Promise<boolean> => {
      const ws = await getWorkspace(workspaceId).catch(() => null);
      if (!ws) return true; // gone — stop following
      if (ws.state !== lastState) {
        lastState = ws.state;
        if (ws.state === 'failed') {
          const reason = (ws.metadata as any)?.error ?? 'run failed';
          await this.reply(runtime, message, `Workspace ${workspaceId} failed: ${reason}`);
        } else {
          await this.reply(runtime, message, `Workspace ${workspaceId}: ${ws.state}.`);
        }
      }
      return isFinalState(ws.state);
    };

    const loop = async (): Promise<void> => {
      try {
        const done = await tick();
        if (done || Date.now() - startedAt > STATUS_POLL_MAX_MS) return;
      } catch (err) {
        logger.warn({ workspaceId, err }, 'connectors status poll failed');
      }
      setTimeout(() => void loop(), STATUS_POLL_INTERVAL_MS);
    };
    setTimeout(() => void loop(), STATUS_POLL_INTERVAL_MS);
  }

  /** Send a reply to the originating conversation (threaded under the message). */
  private async reply(runtime: ChannelRuntime, message: NormalizedInboundMessage, text: string): Promise<void> {
    if (!runtime.port) return; // no live port (SDK/build unavailable) — nothing to send through
    try {
      await runtime.port.send({
        target: {
          channel: message.channel,
          accountId: message.accountId,
          conversationId: message.conversationId,
          replyTo: message.messageId,
        },
        text,
      });
    } catch (err) {
      logger.warn({ channel: message.channel, err }, 'connectors reply failed');
    }
  }
}
