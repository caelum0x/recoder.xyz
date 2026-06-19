import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyEdgeSecurityHeaders,
  checkEdgeSlidingWindowLimit,
  getEdgeSecurityPolicy,
  resetEdgeSecurityState,
} from './edge-security.js';

describe('edge-security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T10:00:00.000Z'));
    resetEdgeSecurityState();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
    resetEdgeSecurityState();
  });

  it('defaults previews to signed protection and clamps unsafe rate limits', () => {
    process.env.RECODER_EDGE_PREVIEW_PROTECTION_MODE = 'invalid';
    process.env.RECODER_EDGE_PREVIEW_RATE_LIMIT_PER_MINUTE = '1';
    process.env.RECODER_EDGE_PUBLIC_RATE_LIMIT_PER_MINUTE = '2';

    const policy = getEdgeSecurityPolicy();

    expect(policy.defaultPreviewProtectionMode).toBe('signed');
    expect(policy.previewRateLimitPerMinute).toBe(10);
    expect(policy.publicRouteRateLimitPerMinute).toBe(30);
  });

  it('projects WAF hook modes from production env', () => {
    process.env.RECODER_EDGE_CROWDSEC_ENABLED = 'true';
    process.env.RECODER_EDGE_CROWDSEC_MODE = 'enforce';
    process.env.RECODER_EDGE_OPENAPPSEC_ENABLED = 'true';
    process.env.RECODER_EDGE_OPENAPPSEC_MODE = 'log';

    const policy = getEdgeSecurityPolicy();

    expect(policy.crowdsec).toEqual({ enabled: true, mode: 'enforce' });
    expect(policy.openAppSec).toEqual({ enabled: true, mode: 'log' });
  });

  it('sets no-store cache headers for private previews', () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };

    applyEdgeSecurityHeaders(response as never, { privatePreview: true });

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Cache-Control')).toContain('no-store');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('enforces a sliding-window preview rate limit and resets after the window', () => {
    expect(checkEdgeSlidingWindowLimit('preview:project-1:ip', 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(checkEdgeSlidingWindowLimit('preview:project-1:ip', 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(checkEdgeSlidingWindowLimit('preview:project-1:ip', 2, 60_000)).toMatchObject({
      allowed: false,
      remaining: 0,
    });

    vi.advanceTimersByTime(60_001);

    expect(checkEdgeSlidingWindowLimit('preview:project-1:ip', 2, 60_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
