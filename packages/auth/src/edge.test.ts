import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COOKIE_NAMES,
  COOKIE_DOMAIN,
  SURFACE_ORIGINS,
  parseSessionToken,
  hasSessionCookie,
  extractSessionToken,
  extractSessionTokenFromHeader,
} from './edge';

test('SESSION_COOKIE_NAMES contains both plain and secure variants', () => {
  assert.ok(SESSION_COOKIE_NAMES.includes('recoder.session_token'));
  assert.ok(SESSION_COOKIE_NAMES.includes('__Secure-recoder.session_token'));
  assert.equal(SESSION_COOKIE_NAMES.length, 2);
});

test('COOKIE_DOMAIN is .recoder.xyz', () => {
  assert.equal(COOKIE_DOMAIN, '.recoder.xyz');
});

test('SURFACE_ORIGINS includes all production surfaces', () => {
  assert.equal(SURFACE_ORIGINS.app, 'https://recoder.xyz');
  assert.equal(SURFACE_ORIGINS.agency, 'https://agency.recoder.xyz');
  assert.equal(SURFACE_ORIGINS.pm, 'https://pm.recoder.xyz');
  assert.equal(SURFACE_ORIGINS.api, 'https://api.recoder.xyz');
});

test('parseSessionToken strips signature suffix', () => {
  assert.equal(parseSessionToken('abc123.signature'), 'abc123');
  assert.equal(parseSessionToken('tokennotsigned'), 'tokennotsigned');
  assert.equal(parseSessionToken('a.b.c'), 'a');
});

test('hasSessionCookie returns true when plain cookie exists', () => {
  const getCookie = (name: string) =>
    name === 'recoder.session_token' ? 'token-value' : null;
  assert.equal(hasSessionCookie(getCookie), true);
});

test('hasSessionCookie returns true when secure cookie exists', () => {
  const getCookie = (name: string) =>
    name === '__Secure-recoder.session_token' ? 'token-value' : null;
  assert.equal(hasSessionCookie(getCookie), true);
});

test('hasSessionCookie returns false when no cookie exists', () => {
  const getCookie = () => null;
  assert.equal(hasSessionCookie(getCookie), false);
});

test('hasSessionCookie returns false for empty string values', () => {
  const getCookie = () => '';
  assert.equal(hasSessionCookie(getCookie), false);
});

test('extractSessionToken returns plain cookie token', () => {
  const getCookie = (name: string) =>
    name === 'recoder.session_token' ? 'my-token' : null;
  assert.equal(extractSessionToken(getCookie), 'my-token');
});

test('extractSessionToken prefers plain over secure (iteration order)', () => {
  const getCookie = (name: string) => {
    if (name === 'recoder.session_token') return 'plain-token';
    if (name === '__Secure-recoder.session_token') return 'secure-token';
    return null;
  };
  assert.equal(extractSessionToken(getCookie), 'plain-token');
});

test('extractSessionToken returns null when no cookies', () => {
  assert.equal(extractSessionToken(() => null), null);
});

test('extractSessionTokenFromHeader parses plain cookie from header', () => {
  const header = 'other=value; recoder.session_token=abc123.sig; another=x';
  assert.equal(extractSessionTokenFromHeader(header), 'abc123');
});

test('extractSessionTokenFromHeader parses secure cookie from header', () => {
  const header = '__Secure-recoder.session_token=def456.sig; other=value';
  assert.equal(extractSessionTokenFromHeader(header), 'def456');
});

test('extractSessionTokenFromHeader returns null for missing cookies', () => {
  const header = 'other_cookie=value; session=nope';
  assert.equal(extractSessionTokenFromHeader(header), null);
});

test('extractSessionTokenFromHeader handles URL-encoded values', () => {
  const header = 'recoder.session_token=' + encodeURIComponent('tok+en.sig');
  assert.equal(extractSessionTokenFromHeader(header), 'tok+en');
});

test('extractSessionTokenFromHeader handles empty header', () => {
  assert.equal(extractSessionTokenFromHeader(''), null);
});
