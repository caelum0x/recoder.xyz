import assert from 'node:assert/strict';
import test from 'node:test';

// We can only test edge-compatible (no-DB) functions from cross-domain
// since verifySessionToken requires Prisma/database access.
import {
  hasSessionInRequest,
  extractSessionFromRequest,
  getSessionCookieAttributes,
  getSignOutCookieAttributes,
  isTrustedOrigin,
  SESSION_COOKIE_NAMES,
  COOKIE_DOMAIN,
} from './cross-domain';

function mockRequest(cookies: Record<string, string>) {
  return {
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value !== undefined ? { value } : undefined;
      },
    },
  };
}

test('hasSessionInRequest detects plain cookie', () => {
  const req = mockRequest({ 'recoder.session_token': 'tok' });
  assert.equal(hasSessionInRequest(req), true);
});

test('hasSessionInRequest detects secure cookie', () => {
  const req = mockRequest({ '__Secure-recoder.session_token': 'tok' });
  assert.equal(hasSessionInRequest(req), true);
});

test('hasSessionInRequest returns false for no session cookie', () => {
  const req = mockRequest({ 'other': 'value' });
  assert.equal(hasSessionInRequest(req), false);
});

test('extractSessionFromRequest returns raw token', () => {
  const req = mockRequest({ 'recoder.session_token': 'raw-token.sig' });
  assert.equal(extractSessionFromRequest(req), 'raw-token.sig');
});

test('extractSessionFromRequest returns null for no cookie', () => {
  const req = mockRequest({});
  assert.equal(extractSessionFromRequest(req), null);
});

test('getSessionCookieAttributes returns secure cookie in production', () => {
  const attrs = getSessionCookieAttributes({ production: true });
  assert.equal(attrs.cookieName, '__Secure-recoder.session_token');
  assert.equal(attrs.domain, COOKIE_DOMAIN);
  assert.equal(attrs.secure, true);
  assert.equal(attrs.sameSite, 'none');
  assert.equal(attrs.httpOnly, true);
  assert.equal(attrs.path, '/');
});

test('getSessionCookieAttributes returns non-secure cookie in development', () => {
  const attrs = getSessionCookieAttributes({ production: false });
  assert.equal(attrs.cookieName, 'recoder.session_token');
  assert.equal(attrs.domain, undefined);
  assert.equal(attrs.secure, false);
  assert.equal(attrs.sameSite, 'lax');
});

test('getSignOutCookieAttributes clears both cookie variants', () => {
  const cookies = getSignOutCookieAttributes({ production: true });
  assert.equal(cookies.length, SESSION_COOKIE_NAMES.length);

  for (const cookie of cookies) {
    assert.equal(cookie.value, '');
    assert.equal(cookie.maxAge, 0);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.path, '/');
  }

  const names = cookies.map((c) => c.name);
  assert.ok(names.includes('recoder.session_token'));
  assert.ok(names.includes('__Secure-recoder.session_token'));
});

test('getSignOutCookieAttributes sets domain in production', () => {
  const cookies = getSignOutCookieAttributes({ production: true });
  for (const cookie of cookies) {
    assert.equal(cookie.domain, COOKIE_DOMAIN);
  }
});

test('getSignOutCookieAttributes omits domain in development', () => {
  const cookies = getSignOutCookieAttributes({ production: false });
  for (const cookie of cookies) {
    assert.equal('domain' in cookie, false);
  }
});

test('isTrustedOrigin accepts known surface origins', () => {
  assert.equal(isTrustedOrigin('https://recoder.xyz'), true);
  assert.equal(isTrustedOrigin('https://studio.recoder.xyz'), true);
  assert.equal(isTrustedOrigin('https://api.recoder.xyz'), true);
});

test('isTrustedOrigin accepts arbitrary recoder.xyz subdomains', () => {
  assert.equal(isTrustedOrigin('https://new-surface.recoder.xyz'), true);
  assert.equal(isTrustedOrigin('https://test.recoder.xyz'), true);
});

test('isTrustedOrigin rejects non-recoder origins', () => {
  assert.equal(isTrustedOrigin('https://evil.com'), false);
  assert.equal(isTrustedOrigin('https://recoder.evil.com'), false);
  assert.equal(isTrustedOrigin('https://notrecoder.xyz'), false);
});

test('isTrustedOrigin rejects empty or invalid strings', () => {
  assert.equal(isTrustedOrigin(''), false);
  assert.equal(isTrustedOrigin('not-a-url'), false);
});
