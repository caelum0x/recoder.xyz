/**
 * OAuth account-linking takeover guard.
 *
 * Better Auth 1.3.34 auto-links an OAuth sign-in into an existing local user
 * with the same email when the provider is "trusted" (github/google) OR the
 * incoming OAuth email is verified. Its guard —
 *   `if (!isTrustedProvider && !userInfo.emailVerified || accountLinking.enabled === false)`
 * (see `handleOAuthUserInfo` in node_modules/better-auth) — never inspects the
 * *existing* user's verification state. So a squatted UNVERIFIED local account
 * (an attacker sets a password on victim@example, never verifies it) gets the
 * victim's real Google/GitHub identity linked into it, and the attacker's
 * password now unlocks a freshly-verified shared account: account takeover.
 *
 * This layer denies exactly that case WITHOUT weakening the verified-email UX:
 * refuse to link a social provider into a PRE-EXISTING user whose
 * `emailVerified` is not `true`. Verified users keep linking normally, and a
 * brand-new OAuth sign-up (user just created, still zero accounts) is untouched.
 *
 * It is wired as a `databaseHooks.account.create.before` hook. That hook fires
 * from `internalAdapter.linkAccount()`; returning `false` there would only skip
 * the row insert while Better Auth STILL issues a session, so this guard THROWS
 * instead — the OAuth callback's try/catch converts the throw into a denied
 * "account not linked" result.
 */

export interface ExistingUserForLink {
  emailVerified?: boolean | null;
}

export interface OAuthLinkGuardInput {
  /** providerId of the account row being created (e.g. "github", "credential"). */
  providerId: string;
  /** Configured social/OAuth provider ids; only these can drive a takeover link. */
  socialProviderIds: readonly string[];
  /** The user row the account would attach to, or null/undefined when none exists. */
  existingUser: ExistingUserForLink | null | undefined;
  /** How many accounts the existing user already has (0 => fresh sign-up, not a link). */
  existingAccountCount: number;
}

/**
 * Pure security predicate. Returns `true` when linking must be DENIED because
 * it would attach a social identity to a pre-existing, unverified account.
 */
export function shouldBlockOAuthAccountLink(input: OAuthLinkGuardInput): boolean {
  const { providerId, socialProviderIds, existingUser, existingAccountCount } =
    input;

  // Only social/OAuth links can silently attach to a stranger's account. A
  // credential / email-password / magic-link create is never a takeover here.
  if (!socialProviderIds.includes(providerId)) return false;

  // No existing user row => a brand-new email, nothing to take over.
  if (!existingUser) return false;

  // A verified existing user provably owns the email; linking is safe and is
  // the normal, expected UX we must preserve.
  if (existingUser.emailVerified === true) return false;

  // Zero prior accounts => the user was just created in THIS same OAuth
  // sign-up (`createOAuthUser`), not a link into a pre-existing account.
  if (existingAccountCount < 1) return false;

  // Social link into a PRE-EXISTING, UNVERIFIED user => takeover risk. Deny.
  return true;
}

/** Error thrown to abort a denied link; Better Auth maps it to "account not linked". */
export const OAUTH_LINK_DENIED_ERROR =
  'oauth_account_link_denied_unverified_existing_user';

interface LinkGuardInternalAdapter {
  findUserById: (userId: string) => Promise<ExistingUserForLink | null | undefined>;
  findAccounts: (userId: string) => Promise<unknown[] | null | undefined>;
}

/**
 * Narrow the opaque Better Auth endpoint context down to the two internal
 * adapter reads we need, without trusting its shape (`unknown` in, explicit
 * type guards out).
 */
function resolveInternalAdapter(context: unknown): LinkGuardInternalAdapter | null {
  if (!context || typeof context !== 'object') return null;
  const inner = (context as { context?: unknown }).context;
  if (!inner || typeof inner !== 'object') return null;
  const adapter = (inner as { internalAdapter?: unknown }).internalAdapter;
  if (!adapter || typeof adapter !== 'object') return null;
  const candidate = adapter as Partial<LinkGuardInternalAdapter>;
  if (
    typeof candidate.findUserById !== 'function' ||
    typeof candidate.findAccounts !== 'function'
  ) {
    return null;
  }
  return candidate as LinkGuardInternalAdapter;
}

/**
 * Build the `account.create.before` hook. `socialProviderIds` are the provider
 * ids that can trigger auto-linking (the keys of `socialProviders`).
 */
export function createOAuthAccountLinkGuard(
  socialProviderIds: readonly string[]
) {
  return async function accountCreateBefore(
    account: { providerId?: string | null; userId?: string | null },
    context?: unknown
  ): Promise<void> {
    const providerId = account?.providerId;
    const userId = account?.userId;

    // Missing identifiers or a non-social provider: not a takeover vector.
    if (!providerId || !userId) return;
    if (!socialProviderIds.includes(providerId)) return;

    const internalAdapter = resolveInternalAdapter(context);
    // A social link we cannot verify against the existing user's state: fail
    // CLOSED. The genuine OAuth link/sign-up paths always carry the context, so
    // this only trips on an abnormal call — deny rather than risk auto-linking.
    if (!internalAdapter) {
      throw new Error(OAUTH_LINK_DENIED_ERROR);
    }

    const existingUser = await internalAdapter.findUserById(userId);
    // No pre-existing user, or a verified owner: nothing to guard.
    if (!existingUser) return;
    if (existingUser.emailVerified === true) return;

    const existingAccounts = await internalAdapter.findAccounts(userId);
    const existingAccountCount = Array.isArray(existingAccounts)
      ? existingAccounts.length
      : 0;

    if (
      shouldBlockOAuthAccountLink({
        providerId,
        socialProviderIds,
        existingUser,
        existingAccountCount,
      })
    ) {
      throw new Error(OAUTH_LINK_DENIED_ERROR);
    }
  };
}
