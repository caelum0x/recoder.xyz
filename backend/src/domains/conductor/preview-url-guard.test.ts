/**
 * Preview-URL guard (SSRF fence). Only http(s) loopback URLs pass; 0.0.0.0 /
 * 127.0.0.1 normalize to localhost; everything else (remote hosts, other
 * protocols, junk) returns null so nothing is persisted.
 */
import { describe, it, expect } from 'vitest';
import { normalizeLocalPreviewUrl } from './review/preview-url-guard.js';

describe('normalizeLocalPreviewUrl', () => {
  it('accepts and normalizes loopback dev URLs', () => {
    expect(normalizeLocalPreviewUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
    expect(normalizeLocalPreviewUrl('http://127.0.0.1:5173/app')).toBe('http://localhost:5173/app');
    expect(normalizeLocalPreviewUrl('http://0.0.0.0:8080')).toBe('http://localhost:8080/');
    expect(normalizeLocalPreviewUrl('http://[::1]:4000/')).toBe('http://[::1]:4000/');
  });

  it('rejects non-loopback hosts (SSRF fence)', () => {
    expect(normalizeLocalPreviewUrl('http://evil.example.com/')).toBeNull();
    expect(normalizeLocalPreviewUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(normalizeLocalPreviewUrl('http://10.0.0.5:3000/')).toBeNull();
  });

  it('rejects non-http protocols and junk', () => {
    expect(normalizeLocalPreviewUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeLocalPreviewUrl('ftp://localhost/')).toBeNull();
    expect(normalizeLocalPreviewUrl('not a url')).toBeNull();
    expect(normalizeLocalPreviewUrl('')).toBeNull();
    expect(normalizeLocalPreviewUrl(42)).toBeNull();
  });
});
