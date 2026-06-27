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
import { TelegramConnector } from './telegram-connector.js';
import { loadConnectorsConfig, type ChannelConfig, type ConnectorsConfig } from './config.js';

const logger = createLogger('connectors:gateway');

/** How long to follow a launched workspace before giving up on status polling. */
const STATUS_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_MAX_MS = 30 * 60_000; // 30 minutes

/** Per-channel live state for truthful health reporting. */
interface ChannelRuntime {
  readonly config: ChannelConfig;
  readonly port: ConnectorPort;
  handle?: ConnectorMonitorHandle;
  /** Last probe result — never faked; only set after a real probe(). */
  lastProbe?: ConnectorProbeResult;
}

export interface ChannelHealth {
  readonly channel: string;
  readonly accountId: string;
  /** Credential present in env (so this channel was instantiated). */
  readonly configured: boolean;
  /** A real probe() reported the account reachable + authorized. */
  readonly connected: boolean;
  readonly identity?: string;
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

  constructor(config: ConnectorsConfig = loadConnectorsConfig()) {
    this.config = config;
    for (const channel of config.channels) {
      const port = this.buildPort(channel);
      if (port) this.runtimes.push({ config: channel, port });
    }
  }

  /** Construct the real ConnectorPort for a configured channel. */
  private buildPort(channel: ChannelConfig): ConnectorPort | null {
    switch (channel.channel) {
      case 'telegram':
        return new TelegramConnector({ token: channel.token, accountId: channel.accountId });
      default:
        // No real adapter for this channel in the bridge yet — skip (config
        // already filters to real channels, so this is defensive only).
        return null;
    }
  }

  /** True when at least one channel was configured (credential present). */
  get active(): boolean {
    return this.runtimes.length > 0;
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
        // Probe first so health is truthful even before the first message.
        runtime.lastProbe = await runtime.port.probe(runtime.config.accountId);
        runtime.handle = await runtime.port.monitor(runtime.config.accountId, (message) =>
          this.handleInbound(runtime, message),
        );
        logger.info(
          { channel: runtime.config.channel, ready: runtime.lastProbe?.ready, identity: runtime.lastProbe?.identity },
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

  /** Truthful per-channel health — re-probes each channel live. */
  async health(): Promise<ConnectorsHealth> {
    const channels = await Promise.all(
      this.runtimes.map(async (r): Promise<ChannelHealth> => {
        let probe = r.lastProbe;
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
        return {
          channel: r.config.channel,
          accountId: r.config.accountId,
          configured: true,
          connected: probe?.ready === true,
          identity: probe?.identity,
          error: probe?.error,
          checkedAt: probe?.checkedAt,
        };
      }),
    );
    return {
      active: this.active,
      dispatchReady: Boolean(this.config.dispatch),
      channels,
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
   * Handle one gated-or-not inbound message: run the trust boundary, and only on
   * a clean pass launch a real workspace and follow its status.
   */
  private async handleInbound(runtime: ChannelRuntime, message: NormalizedInboundMessage): Promise<void> {
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
      // Passed the gate but carried no actionable command — nothing to dispatch.
      return;
    }

    if (!this.config.dispatch) {
      await this.reply(runtime, message, 'Connectors received your command but dispatch is not configured (set CONNECTORS_REPO_PATH).');
      return;
    }

    await this.dispatch(runtime, message, command.prompt);
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
      .react({
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
