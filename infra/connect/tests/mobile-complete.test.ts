import { describe, expect, it } from 'vitest';
import {
  CONNECT_SESSION_COOKIE_NAME,
  DEFAULT_RECODER_REMOTE_SCHEME,
  buildMobileDeepLink,
  extractSessionCookieValue,
  renderMobileCompletePage,
  resolveRemoteScheme,
} from '../src/auth/mobile-complete.js';

describe('extractSessionCookieValue', () => {
  it('returns null when there is no Cookie header', () => {
    expect(extractSessionCookieValue(new Headers())).toBeNull();
  });

  it('returns null when the Cookie header has other cookies but not this one', () => {
    const headers = new Headers({ cookie: 'some_other=abc; another=def' });
    expect(extractSessionCookieValue(headers)).toBeNull();
  });

  it('extracts the exact session cookie value among several cookies', () => {
    const headers = new Headers({
      cookie: `foo=bar; ${CONNECT_SESSION_COOKIE_NAME}=the-real-token; baz=qux`,
    });
    expect(extractSessionCookieValue(headers)).toBe('the-real-token');
  });

  it('extracts the value when it is the only cookie present', () => {
    const headers = new Headers({ cookie: `${CONNECT_SESSION_COOKIE_NAME}=solo-token` });
    expect(extractSessionCookieValue(headers)).toBe('solo-token');
  });

  it('url-decodes the cookie value', () => {
    const headers = new Headers({ cookie: `${CONNECT_SESSION_COOKIE_NAME}=a%2Bb%3Dc` });
    expect(extractSessionCookieValue(headers)).toBe('a+b=c');
  });

  it('does not match a cookie name that merely contains the target name as a substring', () => {
    const headers = new Headers({ cookie: `not_${CONNECT_SESSION_COOKIE_NAME}=wrong` });
    expect(extractSessionCookieValue(headers)).toBeNull();
  });
});

describe('resolveRemoteScheme', () => {
  it('falls back to the default scheme when unset', () => {
    expect(resolveRemoteScheme({})).toBe(DEFAULT_RECODER_REMOTE_SCHEME);
  });

  it('falls back to the default scheme when set to an empty/whitespace string', () => {
    expect(resolveRemoteScheme({ RECODER_REMOTE_SCHEME: '   ' })).toBe(DEFAULT_RECODER_REMOTE_SCHEME);
  });

  it('uses a configured scheme when present', () => {
    expect(resolveRemoteScheme({ RECODER_REMOTE_SCHEME: 'recoder-remote-dev' })).toBe('recoder-remote-dev');
  });
});

describe('buildMobileDeepLink', () => {
  it('builds a scheme URL carrying token and email as query params', () => {
    const link = buildMobileDeepLink({ scheme: 'recoder-remote', token: 'tok123', email: 'dev@example.com' });
    expect(link).toBe('recoder-remote://auth/callback?token=tok123&email=dev%40example.com');
  });

  it('percent-encodes special characters in the token and email', () => {
    const link = buildMobileDeepLink({ scheme: 'recoder-remote', token: 'a b&c', email: 'a+b@example.com' });
    const parsed = new URL(link.replace('recoder-remote://', 'https://'));
    expect(parsed.searchParams.get('token')).toBe('a b&c');
    expect(parsed.searchParams.get('email')).toBe('a+b@example.com');
  });
});

describe('renderMobileCompletePage', () => {
  it('renders a redirect script to the deep link on success', () => {
    const html = renderMobileCompletePage({ ok: true, deepLink: 'recoder-remote://auth/callback?token=t&email=e%40x.com' });
    expect(html).toContain('location.replace("recoder-remote://auth/callback?token=t&email=e%40x.com")');
    expect(html).toContain('href="recoder-remote://auth/callback?token=t&email=e%40x.com"');
  });

  it('escapes double quotes in the deep link so it cannot break out of the HTML attribute/script string', () => {
    const html = renderMobileCompletePage({ ok: true, deepLink: 'recoder-remote://x?token=a"onload="alert(1)' });
    expect(html).not.toContain('"onload="alert(1)"');
    expect(html).toContain('&quot;onload=&quot;alert(1)');
  });

  it('renders a plain expired-link message on failure, with no deep link', () => {
    const html = renderMobileCompletePage({ ok: false });
    expect(html).toContain('invalid or has expired');
    expect(html).not.toContain('location.replace');
  });
});
