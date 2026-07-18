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
 *
 * TENANT IDENTITY (SECURITY): the target user is a tenant-owned subject, so it is
 * derived from the host-authorized {@link McpToolCaller} — NEVER from free-form
 * `args` alone. The edge only binds `args.userId` to the authenticated principal
 * for the CALL; the *subject-selector* fields these tools read (`identity_resolve`'s
 * `userId`, `identity_link`'s `authUserId`/`legacyUsersId`) are NOT edge-bound, so
 * trusting them lets any authenticated caller read another user's identity (email /
 * name / legacy linkage) or graft an arbitrary legacy CLI account onto a canonical
 * account. Therefore:
 *   - `identity_resolve` — a NON-privileged caller may resolve only its OWN
 *     `userId`; a foreign `args.userId` is rejected (403); no args ⇒ the caller's
 *     own id. Only an `admin`/`internal` caller may name an arbitrary id.
 *   - `identity_link`    — a graph MUTATION; gated to `admin`/`internal` callers
 *     only, mirroring the `requireInternal` HTTP route. Any other caller is denied.
 * Absent a caller, every handler refuses (`AUTH_REQUIRED`) rather than guessing.
 */
import { AppError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { Credential } from '../types.js';
import type { IdentityModule } from '../index.js';

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may name an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The authorized caller's own id, or refuse (never guess an identity). */
function requireCallerUserId(caller: McpToolCaller | undefined, tool: string): string {
  const authUserId = str(caller?.userId);
  if (!caller || !authUserId) {
    throw new AppError(ErrorCode.AUTH_REQUIRED, `${tool}: no authorized caller identity`);
  }
  return authUserId;
}

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
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authUserId = requireCallerUserId(caller, 'identity_resolve');
        const input = (raw ?? {}) as ResolveInput;
        // The subject selector is a tenant-owned target, not an edge-bound arg: a
        // non-privileged caller may only resolve its OWN canonical id, else the
        // victim's email/name/legacy-link would leak. No id ⇒ the caller's own id.
        const requested = str(input.userId);
        const userId = requested ?? authUserId;
        if (requested && requested !== authUserId && !isPrivileged(caller!)) {
          throw new AppError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'identity_resolve: caller may only resolve its own identity',
          );
        }
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
      description:
        'Link a legacy CLI users.id to a canonical Better Auth user.id (idempotent). Admin/internal only.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        // Identity-graph MUTATION over two arbitrary, non-edge-bound selectors: an
        // agent-facing caller must never graft a legacy account onto a canonical
        // one. Gated to admin/internal, mirroring the `requireInternal` HTTP route.
        requireCallerUserId(caller, 'identity_link');
        if (!isPrivileged(caller!)) {
          throw new AppError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'identity_link: requires an admin/internal caller',
          );
        }
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
