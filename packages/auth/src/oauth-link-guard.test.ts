import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldBlockOAuthAccountLink,
  createOAuthAccountLinkGuard,
  OAUTH_LINK_DENIED_ERROR,
} from './oauth-link-guard';

const SOCIAL = ['github', 'google'] as const;

// --- Pure predicate: the security invariant -------------------------------

test('blocks a social link into a PRE-EXISTING, UNVERIFIED user (takeover)', () => {
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'github',
      socialProviderIds: SOCIAL,
      existingUser: { emailVerified: false },
      existingAccountCount: 1,
    }),
    true
  );
});

test('allows linking into a VERIFIED existing user (normal UX preserved)', () => {
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'google',
      socialProviderIds: SOCIAL,
      existingUser: { emailVerified: true },
      existingAccountCount: 1,
    }),
    false
  );
});

test('allows a fresh OAuth sign-up (no pre-existing account, so not a link)', () => {
  // createOAuthUser makes the user then the account; at account.create time the
  // just-created user has zero accounts even if reported unverified.
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'github',
      socialProviderIds: SOCIAL,
      existingUser: { emailVerified: false },
      existingAccountCount: 0,
    }),
    false
  );
});

test('never touches non-social providers (credential / email-password sign-up)', () => {
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'credential',
      socialProviderIds: SOCIAL,
      existingUser: { emailVerified: false },
      existingAccountCount: 1,
    }),
    false
  );
});

test('allows when no existing user row (brand-new email)', () => {
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'github',
      socialProviderIds: SOCIAL,
      existingUser: null,
      existingAccountCount: 0,
    }),
    false
  );
});

test('treats emailVerified null/undefined as UNVERIFIED (fail closed)', () => {
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'github',
      socialProviderIds: SOCIAL,
      existingUser: { emailVerified: null },
      existingAccountCount: 1,
    }),
    true
  );
  assert.equal(
    shouldBlockOAuthAccountLink({
      providerId: 'github',
      socialProviderIds: SOCIAL,
      existingUser: {},
      existingAccountCount: 1,
    }),
    true
  );
});

// --- Wired hook: throws so Better Auth's link path DENIES the sign-in ------

function fakeContext(user: unknown, accounts: unknown[]) {
  return {
    context: {
      internalAdapter: {
        findUserById: async () => user,
        findAccounts: async () => accounts,
      },
    },
  };
}

test('hook THROWS on takeover link (throw is what denies sign-in, not `false`)', async () => {
  const guard = createOAuthAccountLinkGuard(SOCIAL);
  await assert.rejects(
    () =>
      guard(
        { providerId: 'github', userId: 'victim-id' },
        fakeContext({ emailVerified: false }, [{ id: 'credential-acct' }])
      ),
    (err: unknown) =>
      err instanceof Error && err.message === OAUTH_LINK_DENIED_ERROR
  );
});

test('hook resolves (allows) linking into a verified existing user', async () => {
  const guard = createOAuthAccountLinkGuard(SOCIAL);
  await assert.doesNotReject(() =>
    guard(
      { providerId: 'google', userId: 'owner-id' },
      fakeContext({ emailVerified: true }, [{ id: 'credential-acct' }])
    )
  );
});

test('hook resolves (allows) a fresh OAuth sign-up with zero prior accounts', async () => {
  const guard = createOAuthAccountLinkGuard(SOCIAL);
  await assert.doesNotReject(() =>
    guard(
      { providerId: 'github', userId: 'new-id' },
      fakeContext({ emailVerified: false }, [])
    )
  );
});

test('hook ignores non-social providers entirely (no adapter lookup needed)', async () => {
  const guard = createOAuthAccountLinkGuard(SOCIAL);
  await assert.doesNotReject(() =>
    guard({ providerId: 'credential', userId: 'x' }, undefined)
  );
});

test('hook FAILS CLOSED for a social link when the adapter is unresolvable', async () => {
  const guard = createOAuthAccountLinkGuard(SOCIAL);
  await assert.rejects(
    () => guard({ providerId: 'github', userId: 'x' }, undefined),
    (err: unknown) =>
      err instanceof Error && err.message === OAUTH_LINK_DENIED_ERROR
  );
});
