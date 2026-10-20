import { describe, expect, it } from 'vitest';
import { isRealCredential } from '../is-real-credential';

describe('lib/auth/is-real-credential', () => {
  it('rejects empty/blank values', () => {
    expect(isRealCredential('')).toBe(false);
    expect(isRealCredential('   ')).toBe(false);
  });

  it('rejects values explicitly prefixed "placeholder"', () => {
    expect(isRealCredential('placeholder-client-id')).toBe(false);
  });

  it('rejects the common "your-..."/"your_..." template placeholders', () => {
    // These are real placeholder strings that were found live-deployed in
    // production (prod env file had a stray appended block re-declaring
    // GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID with these exact unfilled template
    // values, silently shadowing the real credentials declared earlier in
    // the same file — isRealCredential('your-google-oauth-client-id') was
    // `true` before this fix, so the app believed OAuth was configured and
    // sent real users to Google/GitHub with a garbage client_id).
    expect(isRealCredential('your-google-oauth-client-id')).toBe(false);
    expect(isRealCredential('your-github-oauth-client-id')).toBe(false);
    expect(isRealCredential('your-google-oauth-client-secret')).toBe(false);
    expect(isRealCredential('your-github-oauth-client-secret')).toBe(false);
    expect(isRealCredential('your_test_api_key_here')).toBe(false);
    expect(isRealCredential('YOUR-CLIENT-ID')).toBe(false);
  });

  it('accepts real-looking credential values', () => {
    expect(isRealCredential('Iv23liwzwgaRkVKkGlpu')).toBe(true);
    expect(
      isRealCredential(
        '716966330476-4rbi96edvjus5e4q3u7bilvthi8gmvb4.apps.googleusercontent.com'
      )
    ).toBe(true);
    expect(isRealCredential('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')).toBe(true);
  });
});
