/**
 * `oss-components-engine` — a read-only MCP introspection surface over the OSS
 * component registry mirror (domain doc §6; slice BE-6.3). Lets agents DISCOVER
 * which OSS engines/capabilities the deployment binds (the `RecoderComponentDescriptor`
 * rows the repository mirrors) without any mutation. Mirrors the agent-os engine's
 * introspection-only posture: pure reads over the existing repository verbs
 * (`listOssComponents` / `getOssComponent`), never a write.
 *
 * SECURITY POSTURE: unlike the tenant-owned control-plane state-of-record, the OSS
 * component registry is DEPLOYMENT-LEVEL binding metadata — `RecoderComponentDescriptor`
 * carries no `spaceId`/owner, so there is no per-tenant row to leak. These tools are
 * therefore NOT space-scoped. They stay fail-closed on identity, though: the MCP host
 * already ran `authorize→risk→policy→audit`, but we still refuse a call with no
 * authorized caller (`AUTH_REQUIRED`) so an unauthenticated path can never enumerate
 * the deployment's bound OSS surface. This matches the "never guess an identity"
 * rule the sibling agent-os read tools apply.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Require a host-authorized caller identity before any OSS-registry read. The gate
 * already admitted the call, but an absent identity must NEVER enumerate the bound
 * OSS surface — fail closed with `AUTH_REQUIRED` (never guess an identity).
 */
function requireCaller(caller: McpToolCaller | undefined): void {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'oss-components: no authorized caller identity');
  }
}

export function buildOssComponentsMcpTools(
  repository: AgentOsRepositoryPort,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'oss_components_list',
      description:
        'List the OSS components/engines this deployment binds, from the registry mirror (read-only).',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        return repository.listOssComponents();
      },
    },
    {
      name: 'oss_component_get',
      description:
        'Get a single bound OSS component by id from the registry mirror; null if unknown (read-only).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        requireCaller(caller);
        const componentId = str((raw as { componentId?: unknown } | null | undefined)?.componentId);
        if (!componentId) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            'oss-components: `componentId` is required (non-empty string)',
          );
        }
        return repository.getOssComponent(componentId);
      },
    },
  ];
}
