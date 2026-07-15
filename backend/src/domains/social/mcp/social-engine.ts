/**
 * social MCP tools — the READ-ONLY introspection surface registered as the
 * `social` server into the interop-gated MCP host. Every call passes the
 * `authorize→risk→policy→audit` chain at the host boundary, so these handlers stay
 * thin, read-only, and truthful over the repository + channel registry.
 *
 * Per the in-proc engine-wiring checklist: add the engine to `IN_PROC_SERVERS`
 * (interop-host) + `ENGINE_SERVERS` (inproc-engines) and call this builder in
 * `buildInProcEngineRouter`, else the tools 404 (see the wiring report). The
 * write-bearing operations (bind chat, send) stay on the governed HTTP edges.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { SocialConfig } from '../config.js';
import { CHANNEL_IDS, isLiveChannel, type ChannelId } from '../types.js';

export interface SocialEngineDeps {
  readonly repository: SocialRepository;
  readonly channels: ChannelAdapterRegistry;
  readonly config: SocialConfig;
  /** The owner scope binding-list reads resolve against (service identity). */
  readonly ownerId: string;
}

interface OwnedInput {
  readonly userId?: string;
}

export function buildSocialMcpTools(deps: SocialEngineDeps): readonly McpToolRegistration[] {
  const owner = (raw: unknown): string => {
    const input = (raw ?? {}) as OwnedInput;
    return typeof input.userId === 'string' && input.userId.length > 0 ? input.userId : deps.ownerId;
  };
  const enabledLive = (): ChannelId[] =>
    CHANNEL_IDS.filter((id) => deps.config.channels[id]?.enabled && isLiveChannel(id));

  return [
    {
      name: 'social_list_connectors',
      description: 'List registered social connectors (channel/enabled/status) — read-only.',
      handler: async () => {
        const connectors = await deps.repository.listConnectors();
        return { count: connectors.length, connectors };
      },
    },
    {
      name: 'social_list_bindings',
      description: 'List allowlisted chat bindings for an owner (chat_ref → space/agent) — read-only.',
      handler: async (raw: unknown) => {
        const bindings = await deps.repository.listBindings(owner(raw));
        return { count: bindings.length, bindings };
      },
    },
    {
      name: 'social_channel_health',
      description: 'Live per-channel readiness probes for the enabled live channels — truthful.',
      handler: async () => {
        const statuses = await deps.channels.statuses(enabledLive());
        return { channels: statuses };
      },
    },
  ];
}
