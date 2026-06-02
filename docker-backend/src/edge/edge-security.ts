import type { Response } from 'express';

export interface EdgeSecurityPolicy {
  defaultPreviewProtectionMode: 'public' | 'signed' | 'private';
  previewRateLimitPerMinute: number;
  publicRouteRateLimitPerMinute: number;
  crowdsec: {
    enabled: boolean;
    mode: 'log' | 'enforce';
  };
  openAppSec: {
    enabled: boolean;
    mode: 'log' | 'enforce';
  };
}

type SlidingWindowEntry = {
  at: number;
};

const edgeRateLimitStore = new Map<string, SlidingWindowEntry[]>();

export function getEdgeSecurityPolicy(): EdgeSecurityPolicy {
  const previewMode = String(process.env.RECODER_EDGE_PREVIEW_PROTECTION_MODE || 'signed').trim();
  return {
    defaultPreviewProtectionMode:
      previewMode === 'public' || previewMode === 'private' ? previewMode : 'signed',
    previewRateLimitPerMinute: Math.max(10, Number(process.env.RECODER_EDGE_PREVIEW_RATE_LIMIT_PER_MINUTE || 120)),
    publicRouteRateLimitPerMinute: Math.max(30, Number(process.env.RECODER_EDGE_PUBLIC_RATE_LIMIT_PER_MINUTE || 240)),
    crowdsec: {
      enabled: process.env.RECODER_EDGE_CROWDSEC_ENABLED === 'true',
      mode: process.env.RECODER_EDGE_CROWDSEC_MODE === 'enforce' ? 'enforce' : 'log',
    },
    openAppSec: {
      enabled: process.env.RECODER_EDGE_OPENAPPSEC_ENABLED === 'true',
      mode: process.env.RECODER_EDGE_OPENAPPSEC_MODE === 'enforce' ? 'enforce' : 'log',
    },
  };
}

export function applyEdgeSecurityHeaders(
  res: Response,
  options: { privatePreview?: boolean } = {},
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  if (options.privatePreview) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  }
}

export function checkEdgeSlidingWindowLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = edgeRateLimitStore.get(key) ?? [];
  const filtered = existing.filter((entry) => now - entry.at < windowMs);
  const allowed = filtered.length < limit;
  if (allowed) {
    filtered.push({ at: now });
  }
  edgeRateLimitStore.set(key, filtered);

  const oldest = filtered[0]?.at ?? now;
  return {
    allowed,
    remaining: Math.max(0, limit - filtered.length),
    resetAt: oldest + windowMs,
  };
}

export function resetEdgeSecurityState(): void {
  edgeRateLimitStore.clear();
}

