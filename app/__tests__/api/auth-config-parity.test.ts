// @vitest-environment node
/**
 * C4 parity guard: the two Better Auth configs (app/lib/auth-config.ts and
 * @recoder/auth createAuth) must build through the shared factory and share
 * the EXACT advanced cookie block, so every surface reads the same
 * `recoder.session_token` cookie.
 *
 * Imports the real option builders (no mocks) and diffs the resolved options.
 */
import { describe, expect, it } from 'vitest';

// The @recoder/auth builder fails fast on missing env; give it fake test
// values BEFORE the dynamic imports below (never real secrets in tests).
process.env.BETTER_AUTH_SECRET ||= 'test-only-secret';
process.env.BETTER_AUTH_URL ||= 'http://localhost:3000';
// Credential-free URLs keep the strict secret-scan quiet (user:pass@ shapes
// trip it even for obvious fixtures).
process.env.AUTH_DATABASE_URL ||= 'postgresql://localhost:5432/test_auth';
process.env.DATABASE_URL ||= 'postgresql://localhost:5432/test_main';

async function loadResolvedOptions() {
  const authPkg = await import('@recoder/auth');
  const { buildAppAuthOptions } = await import('../../lib/auth-config');

  const appOptions = authPkg.buildRecoderAuthOptions(buildAppAuthOptions());
  const pkgOptions = authPkg.buildRecoderAuthOptions(
    authPkg.buildCreateAuthOptions({ sendMagicLink: async () => {} })
  );
  return { authPkg, appOptions, pkgOptions };
}

describe('auth config parity (shared factory)', () => {
  it('both configs use the SAME advanced cookie block object', async () => {
    const { authPkg, appOptions, pkgOptions } = await loadResolvedOptions();

    // Identity, not just deep equality: drift is impossible when both configs
    // hold a reference to the single shared constant.
    expect(appOptions.advanced).toBe(authPkg.RECODER_COOKIE_ADVANCED);
    expect(pkgOptions.advanced).toBe(authPkg.RECODER_COOKIE_ADVANCED);
  });

  it('cookie prefix and crossSubDomain settings match on both surfaces', async () => {
    const { appOptions, pkgOptions } = await loadResolvedOptions();

    expect(appOptions.advanced.cookiePrefix).toBe('recoder');
    expect(pkgOptions.advanced.cookiePrefix).toBe('recoder');
    expect(appOptions.advanced.crossSubDomainCookies).toEqual(
      pkgOptions.advanced.crossSubDomainCookies
    );
    expect(appOptions.advanced.crossSubDomainCookies.enabled).toBe(true);
    expect(appOptions.advanced.useSecureCookies).toBe(
      pkgOptions.advanced.useSecureCookies
    );
    expect(appOptions.advanced.defaultCookieAttributes).toEqual(
      pkgOptions.advanced.defaultCookieAttributes
    );
  });

  it('both configs share the account-linking policy', async () => {
    const { authPkg, appOptions, pkgOptions } = await loadResolvedOptions();

    expect(appOptions.account?.accountLinking).toBe(
      authPkg.RECODER_ACCOUNT_LINKING
    );
    expect(pkgOptions.account?.accountLinking).toBe(
      authPkg.RECODER_ACCOUNT_LINKING
    );
    expect(authPkg.RECODER_ACCOUNT_LINKING).toEqual({
      enabled: true,
      trustedProviders: ['github', 'google'],
    });
  });

  it('preserves each surface-specific shape (session tuning, model names, magic link)', async () => {
    const { appOptions, pkgOptions } = await loadResolvedOptions();

    // App surface: 30d sessions with 24h refresh and cookie cache.
    expect(appOptions.session).toEqual({
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30 },
    });
    expect(appOptions.plugins).toBeUndefined();

    // Shared-auth-DB surface: explicit model names + magic-link plugin.
    expect(pkgOptions.user).toEqual({ modelName: 'user' });
    expect(pkgOptions.account?.modelName).toBe('account');
    expect(pkgOptions.session).toEqual({ modelName: 'session' });
    expect(pkgOptions.verification).toEqual({ modelName: 'verification' });
    expect(pkgOptions.plugins).toHaveLength(1);
  });

  it('packages/auth trusted origins no longer carry dead pre-pivot subdomains', async () => {
    const { pkgOptions } = await loadResolvedOptions();

    expect(pkgOptions.trustedOrigins).not.toContain('https://ide.recoder.xyz');
    expect(pkgOptions.trustedOrigins).not.toContain('https://app.recoder.xyz');
    expect(pkgOptions.trustedOrigins).toContain('https://recoder.xyz');
  });
});
