/**
 * normalizeLocalPreviewUrl — accept only http(s) localhost/loopback dev URLs
 * (the value is later fetched by the preview engine), normalize wildcard/loopback
 * IPs to `localhost`, and reject everything else.
 */
import { describe, expect, it } from 'vitest';
import { normalizeLocalPreviewUrl } from './preview-url-guard';

describe('normalizeLocalPreviewUrl', () => {
  it('accepts a localhost dev URL', () => {
    expect(normalizeLocalPreviewUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(normalizeLocalPreviewUrl('https://localhost:5173/app')).toBe('https://localhost:5173/app');
  });

  it('normalizes 0.0.0.0 / 127.0.0.1 to localhost', () => {
    expect(normalizeLocalPreviewUrl('http://0.0.0.0:8000')).toBe('http://localhost:8000/');
    expect(normalizeLocalPreviewUrl('http://127.0.0.1:3000/app')).toBe('http://localhost:3000/app');
  });

  it('accepts the IPv6 loopback', () => {
    expect(normalizeLocalPreviewUrl('http://[::1]:4000/')).toBe('http://[::1]:4000/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLocalPreviewUrl('  http://localhost:3000  ')).toBe('http://localhost:3000/');
  });

  it('rejects a non-loopback host (SSRF guard)', () => {
    expect(normalizeLocalPreviewUrl('http://example.com/')).toBeNull();
    expect(normalizeLocalPreviewUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(normalizeLocalPreviewUrl('https://registry.npmjs.org/pkg')).toBeNull();
  });

  it('rejects non-http(s) protocols', () => {
    expect(normalizeLocalPreviewUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeLocalPreviewUrl('ftp://localhost/x')).toBeNull();
    expect(normalizeLocalPreviewUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects malformed, empty, and non-string input', () => {
    expect(normalizeLocalPreviewUrl('not a url')).toBeNull();
    expect(normalizeLocalPreviewUrl('')).toBeNull();
    expect(normalizeLocalPreviewUrl('   ')).toBeNull();
    expect(normalizeLocalPreviewUrl(null)).toBeNull();
    expect(normalizeLocalPreviewUrl(undefined)).toBeNull();
    expect(normalizeLocalPreviewUrl(1234)).toBeNull();
  });
});
