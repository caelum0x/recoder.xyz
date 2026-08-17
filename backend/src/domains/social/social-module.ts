/**
 * `SocialComposer` — the Phase-7 composer that layers the channel-adapter registry
 * (openclaw gateways), connector secrets, the conductor + reply-agent dispatch
 * (consumed via ports), the zrok NAT tunnel, and the inbound pipeline on top of the
 * frozen core module (`createSocialModule`), then exposes the `/api/social` router,
 * the read-only MCP surface, and TRUTHFUL live health.
 *
 * It never edits the frozen core: it consumes `core.mentionGate()/repository()/
 * config()` and composes around them. Degrade-safe throughout — an absent
 * connector dep marks that channel `down`, an unwired conductor/inference seam
 * makes dispatch fail truthfully (never a faked run/reply), and an absent tunnel
 * leaves push channels reporting `down` rather than silently dropping.
 *
 * Bootstrap integrates this serially (never edited there): it supplies the
 * persistence executor, the composed auth middleware, the per-channel enable +
 * secret refs (via `overrides`), and OPTIONALLY the conductor `createWorkspace`
 * seam + the inference reply seam + a secret vault.
 */
import type { Router } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { SocialModule, SocialModuleDeps } from './index.js';
import { createSocialModule } from './index.js';
import type { DispatchPort } from './ports/dispatch.port.js';
import type { PublicTunnelPort } from './ports/tunnel.port.js';
import { createOpenclawGateway, type OpenclawGateway } from './adapters/openclaw-gateway.adapter.js';
import { createChannelAdapterRegistry, type ChannelAdapterRegistry } from './adapters/channel-adapter-registry.js';
import {
  createConnectorSecretsAdapter,
  type DirectSecretResolver,
  type SecretVaultResolver,
} from './adapters/connector-secrets.adapter.js';
import { createZrokTunnelAdapter, type ZrokOpener } from './adapters/zrok-tunnel.adapter.js';
import {
  createConductorDispatch,
  type ConductorDispatchPort,
  type ConductorTargetResolver,
} from './dispatch/conductor-dispatch.js';
import { createReplyAgent, type ReplyInferencePort } from './dispatch/reply-agent.js';
import { createInboundPipeline, type InboundPipeline } from './dispatch/inbound-pipeline.js';
import { buildSocialRoutes } from './routes/social.routes.js';
import { buildSocialMcpTools } from './mcp/social-engine.js';
import { buildLiveSocialHealth } from './live-health.js';
import { CHANNEL_IDS, isChannelId, type ChannelId, type InboundEnvelope } from './types.js';
import type { ConnectorSecretsPort } from './ports/connector-secrets.port.js';

/** Dependencies bootstrap injects into the composer (extends the core deps). */
export interface SocialComposerDeps extends SocialModuleDeps {
  /** The composed identity auth middleware the `/api/social` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** The owner scope MCP/service reads default to. */
  readonly ownerId?: string;
  /** Optional conductor `createWorkspace` seam (Phase 5). Absent ⇒ /run errors. */
  readonly conductor?: ConductorDispatchPort;
  /** Resolves a chat's conductor launch target; absent ⇒ unbound chats error. */
  readonly targetResolver?: ConductorTargetResolver;
  /** Optional inference reply seam (Phase 6). Absent ⇒ replies error. */
  readonly inference?: ReplyInferencePort;
  /** Optional vault resolving secret refs (degrade-safe; absent ⇒ null secrets). */
  readonly vault?: SecretVaultResolver;
  /** Optional direct (local/dev) secret source (takes precedence over the vault). */
  readonly directSecrets?: DirectSecretResolver;
  /** Optional per-channel webhook signing refs (fallback: the token ref). */
  readonly signingRefs?: Partial<Record<ChannelId, string | null>>;
  /** Optional live zrok opener + pre-opened base URL for NAT webhook exposure. */
  readonly zrokOpener?: ZrokOpener;
  readonly zrokPublicBaseUrl?: string | null;
  /** Test seam: override the channel gateway (defaults to the real openclaw one). */
  readonly gateway?: OpenclawGateway;
}

/** The composite surface bootstrap mounts + registers. */
export interface SocialComposite {
  readonly name: 'social';
  /** The frozen core module (mention gate + repository + config + health). */
  core(): SocialModule;
  channels(): ChannelAdapterRegistry;
  secrets(): ConnectorSecretsPort;
  dispatchPort(): DispatchPort;
  tunnel(): PublicTunnelPort;
  pipeline(): InboundPipeline;
  /** The `/api/social` router. */
  routes(): Router;
  /** The read-only MCP tools registered into the interop-gated host. */
  mcp(): readonly McpToolRegistration[];
  /** Truthful LIVE health (config posture + live channel probes). */
  health(): Promise<ComponentHealth>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const SERVICE_OWNER_FALLBACK = 'service:social';

/** A default target resolver that binds nothing (degrade-safe; conductor unbound). */
const UNBOUND_RESOLVER: ConductorTargetResolver = { async resolve() { return null; } };

/** Build the social composite. Pure factory; degrade-safe by construction. */
export function createSocialComposer(deps: SocialComposerDeps): SocialComposite {
  const core = createSocialModule(deps);
  const cfg = core.config();
  const ownerId = deps.ownerId ?? SERVICE_OWNER_FALLBACK;

  // --- channel adapters + secrets -------------------------------------------
  const tokenRefs: Partial<Record<ChannelId, string | null>> = {};
  for (const id of CHANNEL_IDS) tokenRefs[id] = cfg.channels[id]?.secretRef ?? null;
  const secrets = createConnectorSecretsAdapter({
    tokenRefs,
    ...(deps.signingRefs ? { signingRefs: deps.signingRefs } : {}),
    ...(deps.vault ? { vault: deps.vault } : {}),
    ...(deps.directSecrets ? { directResolver: deps.directSecrets } : {}),
  });
  const gateway = deps.gateway ?? createOpenclawGateway();
  const channels = createChannelAdapterRegistry({ gateway, secrets });

  // --- dispatch (conductor /run + reply agent) via ports --------------------
  const dispatchToConductor = createConductorDispatch({
    ...(deps.conductor ? { conductor: deps.conductor } : {}),
    targetResolver: deps.targetResolver ?? UNBOUND_RESOLVER,
  });
  const replyInChannel = createReplyAgent(deps.inference ? { inference: deps.inference } : {});
  const dispatch: DispatchPort = { dispatchToConductor, replyInChannel };

  // --- NAT tunnel (degrade-safe) --------------------------------------------
  const tunnel = createZrokTunnelAdapter({
    enabled: cfg.zrok.enabled,
    shareName: cfg.zrok.shareName,
    ...(deps.zrokPublicBaseUrl !== undefined ? { publicBaseUrl: deps.zrokPublicBaseUrl } : {}),
    ...(deps.zrokOpener ? { opener: deps.zrokOpener } : {}),
  });

  // --- inbound pipeline ------------------------------------------------------
  const pipeline = createInboundPipeline({
    repository: core.repository(),
    mentionGate: core.mentionGate(),
    dispatch,
    channels,
  });

  /** Normalize a verified webhook payload → InboundEnvelope(s) → run the pipeline. */
  async function onVerifiedWebhook(channel: ChannelId, parsed: unknown): Promise<void> {
    const port = await channels.get(channel);
    const normalize = port?.normalize;
    if (!port || typeof normalize !== 'function') return;
    const normalized = await safe(() => Promise.resolve(normalize.call(port, parsed, 'default')));
    if (!normalized) return;
    const env = toInboundEnvelope(channel, normalized);
    if (env) await safe(() => pipeline.ingest(env));
  }

  let started = false;
  /** Live long-poll monitor handles (per enabled channel), stopped on `stop()`. */
  const monitorHandles = new Map<ChannelId, { stop(): Promise<void> }>();

  /**
   * Start the long-poll ingress monitor for one enabled channel. Truthful
   * degrade: an unresolvable port (dep absent) or a monitor fault leaves the
   * channel down + logged — never a faked "monitoring" state.
   */
  async function startMonitor(channel: ChannelId): Promise<void> {
    const port = await channels.get(channel);
    if (!port || typeof port.monitor !== 'function') {
      deps.logger.info({ channel }, 'social channel monitor skipped (connector unavailable)');
      return;
    }
    try {
      const handle = await port.monitor('default', (message) => {
        const env = toInboundEnvelope(channel, message);
        if (env) void safe(() => pipeline.ingest(env));
      });
      monitorHandles.set(channel, handle);
      deps.logger.info({ channel }, 'social channel monitor started');
    } catch (err) {
      deps.logger.warn(
        { channel, err: err instanceof Error ? err.message : String(err) },
        'social channel monitor failed to start (channel stays down)',
      );
    }
  }

  return {
    name: 'social',
    core: () => core,
    channels: () => channels,
    secrets: () => secrets,
    dispatchPort: () => dispatch,
    tunnel: () => tunnel,
    pipeline: () => pipeline,

    routes(): Router {
      return buildSocialRoutes({
        config: cfg,
        repository: core.repository(),
        secrets,
        channels,
        middleware: deps.middleware,
        health: () => buildLiveSocialHealth(cfg, channels),
        onVerifiedWebhook,
      });
    },

    mcp(): readonly McpToolRegistration[] {
      return buildSocialMcpTools({ repository: core.repository(), channels, config: cfg });
    },

    async health(): Promise<ComponentHealth> {
      return buildLiveSocialHealth(cfg, channels);
    },

    async start(): Promise<void> {
      if (started) return;
      started = true;
      const enabled = CHANNEL_IDS.filter((id) => cfg.channels[id]?.enabled);
      // Long-poll ingress monitors for every ENABLED channel (webhook channels'
      // connectors no-op/refuse their monitor truthfully). Started concurrently;
      // each degrades independently and never blocks boot.
      await Promise.all(enabled.map((id) => startMonitor(id)));
      deps.logger.info(
        {
          ownerId,
          enabledChannels: enabled,
          monitoring: [...monitorHandles.keys()],
          conductor: Boolean(deps.conductor),
          inference: Boolean(deps.inference),
          zrok: cfg.zrok.enabled,
        },
        'social composer started',
      );
    },

    async stop(): Promise<void> {
      // Idempotent, degrade-safe: stop every live channel monitor.
      const handles = [...monitorHandles.entries()];
      monitorHandles.clear();
      await Promise.all(handles.map(([, handle]) => safe(() => handle.stop())));
      started = false;
    },
  };
}

/** Map a connector's NormalizedInboundMessage onto the domain InboundEnvelope. */
function toInboundEnvelope(channel: ChannelId, msg: unknown): InboundEnvelope | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const chatRef = str(m.conversationId);
  const providerMsgId = str(m.messageId);
  if (!chatRef || !providerMsgId) return null;
  const sender = (m.sender ?? {}) as Record<string, unknown>;
  const senderId = str(sender.SenderId) ?? str(sender.SenderUsername) ?? str(sender.SenderE164) ?? 'unknown';
  const rawChannel = str(m.channel);
  const resolvedChannel = rawChannel && isChannelId(rawChannel) ? rawChannel : channel;
  return {
    channel: resolvedChannel,
    chatRef,
    senderId,
    providerMsgId,
    text: str(m.text) ?? '',
    ...(typeof m.mentioned === 'boolean' ? { mentioned: m.mentioned } : {}),
  };
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
