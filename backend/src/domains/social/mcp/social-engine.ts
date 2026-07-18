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
 *
 * TENANT IDENTITY (SECURITY): a chat binding (`chat_ref → space/agent`) is
 * tenant-owned data, keyed by `user_id`. `social_list_bindings` therefore derives
 * its owner from the host-authorized {@link McpToolCaller} — NEVER from free-form
 * `args`. Previously the owner came from `args.userId` (falling back to the service
 * owner), so any caller could name a victim `userId` and read that owner's
 * allowlist (cross-tenant binding disclosure). Now a NON-privileged caller may only
 * list its OWN bindings: an args-named `userId` it does not own is rejected (403),
 * and with no args the caller's own `userId` is used. Only an `admin`/`internal`
 * caller may name an arbitrary owner (a service acting on behalf of a tenant).
 * Absent a caller (this surface is edge-reachable), the handler refuses rather than
 * guessing an identity. The connector registry + channel-health tools expose only
 * GLOBAL, non-tenant data (channel/enabled/status + readiness), so they stay
 * caller-agnostic.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { SocialConfig } from '../config.js';
import { CHANNEL_IDS, isLiveChannel, type ChannelId } from '../types.js';

export interface SocialEngineDeps {
  readonly repository: SocialRepository;
  readonly channels: ChannelAdapterRegistry;
  readonly config: SocialConfig;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may name an arbitrary owner? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Resolve the owner whose bindings the handler reads, bound to the authorized
 * {@link McpToolCaller}. A NON-privileged caller may only target its own `userId`;
 * a cross-tenant request (an args `userId` the caller does not own) is rejected
 * (403) rather than served. Absent a caller, refuse (never guess an identity).
 */
function resolveOwner(raw: unknown, caller: McpToolCaller | undefined): string {
  const authUserId = str(caller?.userId);
  if (!caller || !authUserId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'social: no authorized caller identity');
  }
  const requested = str((raw as { userId?: unknown })?.userId);
  if (!requested) return authUserId;
  if (isPrivileged(caller)) return requested;
  if (requested !== authUserId) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'social: caller may only list its own bindings',
    );
  }
  return requested;
}

export function buildSocialMcpTools(deps: SocialEngineDeps): readonly McpToolRegistration[] {
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
      description: 'List allowlisted chat bindings for the caller (chat_ref → space/agent) — read-only.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const owner = resolveOwner(raw, caller);
        const bindings = await deps.repository.listBindings(owner);
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
