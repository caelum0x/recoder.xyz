/**
 * Identity MCP tools (skeleton per the wiring checklist). Registered into the
 * interop-gated MCP host by the engines domain (Phase 6); every call passes the
 * `authorize→risk→policy→audit` interop chain + governance gate at the host
 * boundary, so these handlers stay thin over the module surface.
 *
 *  - `identity_whoami`  — resolve the calling credential → canonical Principal.
 *  - `identity_resolve` — resolve a user id (web OR legacy CLI id) → unified Identity.
 *  - `identity_link`    — link a legacy CLI `users.id` to a canonical `user.id`.
 *
 * The `sk_` key tools (`identity_key_mint/list/revoke`) are contributed by the
 * api-key feature; this engine owns the identity-resolution + unification tools.
 * Handlers report `SERVICE_UNAVAILABLE` when their backing service is not wired
 * rather than faking a result.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Credential } from '../types.js';
import type { IdentityModule } from '../index.js';

interface WhoamiInput {
  readonly cookieHeader?: string;
  readonly authorizationHeader?: string;
  readonly apiKey?: string;
  readonly deviceToken?: string;
}

interface ResolveInput {
  readonly userId?: string;
}

interface LinkInput {
  readonly authUserId?: string;
  readonly legacyUsersId?: string;
}

export function buildIdentityMcpTools(module: IdentityModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'identity_whoami',
      description: 'Resolve the calling credential (cookie / sk_ key / device token) to a canonical Principal.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as WhoamiInput;
        const cred: Credential = {
          cookieHeader: input.cookieHeader ?? null,
          authorizationHeader: input.authorizationHeader ?? null,
          apiKey: input.apiKey ?? null,
          deviceToken: input.deviceToken ?? null,
          // Never resolve an internal-service identity from an MCP tool payload.
          internalKey: null,
        };
        const principal = await module.verifier().verify(cred);
        if (!principal || principal.isAnonymous) {
          return { authenticated: false, principal: null };
        }
        return {
          authenticated: true,
          principal: {
            userId: principal.userId,
            orgId: principal.orgId ?? null,
            email: principal.email ?? null,
            kind: principal.kind,
            scopes: principal.scopes,
          },
        };
      },
    },
    {
      name: 'identity_resolve',
      description: 'Resolve a user id (canonical user.id OR legacy CLI users.id) to the unified Identity.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as ResolveInput;
        const userId = (input.userId ?? '').trim();
        if (!userId) throw new AppError(ErrorCode.INVALID_INPUT, 'userId is required');
        const repo = module.identityRepository();
        if (!repo || !repo.isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'identity unification is unavailable');
        }
        const identity = await repo.resolveIdentity(userId);
        return { identity: identity ?? null };
      },
    },
    {
      name: 'identity_link',
      description: 'Link a legacy CLI users.id to a canonical Better Auth user.id (idempotent).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as LinkInput;
        const authUserId = (input.authUserId ?? '').trim();
        const legacyUsersId = (input.legacyUsersId ?? '').trim();
        if (!authUserId || !legacyUsersId) {
          throw new AppError(ErrorCode.INVALID_INPUT, 'authUserId and legacyUsersId are required');
        }
        const repo = module.identityRepository();
        if (!repo || !repo.isAvailable()) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'identity unification is unavailable');
        }
        const identity = await repo.linkLegacyUser(authUserId, legacyUsersId);
        if (!identity) throw new AppError(ErrorCode.NOT_FOUND, 'canonical user not found for authUserId');
        return { linked: true, identity };
      },
    },
  ];
}
