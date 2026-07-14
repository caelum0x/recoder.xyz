/**
 * electron-builder `afterSign` hook — macOS notarization.
 *
 * Submits the signed .app to Apple's notary service (`notarytool`) via
 * @electron/notarize and staples the ticket so Gatekeeper accepts the app
 * offline. Wired from package.json (`build.afterSign`).
 *
 * Design goals:
 *  - DEGRADE-SAFE on missing credentials. A developer building locally without
 *    Apple credentials (the common case) must get a clean, unsigned/un-notarized
 *    build with a clear log line — never a hard build failure.
 *  - REAL FAILURE is surfaced. When credentials ARE provided, a notarization
 *    error is a genuine release defect and is re-thrown so CI fails loudly
 *    instead of shipping an un-notarized artifact that looks successful.
 *
 * Two credential strategies are supported, matching @electron/notarize:
 *  1. Apple ID + app-specific password (requires all three):
 *       APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *  2. App Store Connect API key (requires all three):
 *       APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
 *
 * If neither strategy is fully configured, notarization is skipped.
 */
const fs = require('fs');
const path = require('path');
const { notarize } = require('@electron/notarize');

/**
 * Resolve which notarization credential strategy is fully configured.
 * Returns the notarytool args object (sans appPath) or `null` when no complete
 * strategy is present.
 *
 * @returns {(import('@electron/notarize').NotaryToolCredentials & { __strategy: string }) | null}
 */
function resolveCredentials(env) {
  const appleId = env.APPLE_ID;
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = env.APPLE_TEAM_ID;

  const apiKey = env.APPLE_API_KEY;
  const apiKeyId = env.APPLE_API_KEY_ID;
  const apiIssuer = env.APPLE_API_ISSUER;

  // Strategy 1: Apple ID + app-specific password. Requires ALL THREE — the
  // notary service rejects a submission that omits the team id, so a partial
  // set is treated as "not configured" rather than attempted-and-failed.
  if (appleId || appleIdPassword || teamId) {
    const missing = [];
    if (!appleId) missing.push('APPLE_ID');
    if (!appleIdPassword) missing.push('APPLE_APP_SPECIFIC_PASSWORD');
    if (!teamId) missing.push('APPLE_TEAM_ID');
    if (missing.length === 0) {
      return { __strategy: 'apple-id', appleId, appleIdPassword, teamId };
    }
    // Partial Apple-ID set: fall through to check the API-key strategy, but
    // remember we saw a partial set so we can warn precisely below.
    if (!apiKey && !apiKeyId && !apiIssuer) {
      console.log(
        `⏭️  Skipping notarization: incomplete Apple ID credentials (missing ${missing.join(', ')}).`,
      );
      return null;
    }
  }

  // Strategy 2: App Store Connect API key.
  if (apiKey || apiKeyId || apiIssuer) {
    const missing = [];
    if (!apiKey) missing.push('APPLE_API_KEY');
    if (!apiKeyId) missing.push('APPLE_API_KEY_ID');
    if (!apiIssuer) missing.push('APPLE_API_ISSUER');
    if (missing.length === 0) {
      if (!fs.existsSync(apiKey)) {
        console.log(
          `⏭️  Skipping notarization: APPLE_API_KEY path does not exist (${apiKey}).`,
        );
        return null;
      }
      return {
        __strategy: 'api-key',
        appleApiKey: apiKey,
        appleApiKeyId: apiKeyId,
        appleApiIssuer: apiIssuer,
      };
    }
    console.log(
      `⏭️  Skipping notarization: incomplete App Store Connect API key (missing ${missing.join(', ')}).`,
    );
    return null;
  }

  console.log(
    '⏭️  Skipping notarization: no Apple credentials in env ' +
      '(set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or ' +
      'APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER).',
  );
  return null;
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS bundles. mas (Mac App Store) builds are notarized by
  // App Store submission, not by us, so they are skipped here too.
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const credentials = resolveCredentials(process.env);
  if (!credentials) {
    // Degrade-safe: a missing/partial credential set is a normal local build,
    // not an error. Never fail the build here.
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    // The signed .app must exist by the afterSign stage. If it does not, the
    // build is already broken upstream — surface it rather than silently pass.
    throw new Error(
      `[notarize] expected signed app at ${appPath}, but it does not exist.`,
    );
  }

  const { __strategy, ...notaryArgs } = credentials;
  console.log(
    `🔔 Notarizing ${appName}.app via notarytool (${__strategy} credentials)…`,
  );

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      ...notaryArgs,
    });
    console.log('✅ Notarization complete and ticket stapled.');
  } catch (error) {
    // Credentials WERE supplied, so this is a real release defect. Fail loudly
    // so CI does not publish an un-notarized artifact that appears successful.
    console.error('❌ Notarization failed:', error && error.message ? error.message : error);
    throw error;
  }
};

// Exported for unit testing of the credential-gating logic without invoking
// the real notary service.
exports.resolveCredentials = resolveCredentials;
