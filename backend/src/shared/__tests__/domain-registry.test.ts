/**
 * Guards the canonical domain registry against mount drift. The registry is the
 * declared source of truth for where each domain's edges mount; a consumer that
 * resolves an edge from `DOMAIN_REGISTRY[key].mountBase` must land on the surface
 * the router actually serves.
 *
 * Regression: `social.mountBase` had drifted to `/api/connectors` while the social
 * module, its routes, and its tests all serve `/api/social` — so a registry-driven
 * `GET /api/connectors` 404'd. These tests pin the reconciled base and prove the
 * route table resolves the social provider (no explicit `basePath`) to it.
 */
import { describe, it, expect } from 'vitest';
import type { Router } from 'express';
import { DOMAIN_REGISTRY, DOMAIN_KEYS, isDomainKey } from '../domain-registry.js';
import { buildRouteTable } from '../../domains/edge/route-table.js';
import type { RouteProvider } from '../../domains/edge/ports/route-provider.port.js';

/** A minimal registry-driven provider: no `basePath`, so the table uses the registry. */
function registryProvider(key: string): RouteProvider {
  return {
    key,
    routes: () => ({}) as unknown as Router,
    health: () => ({ status: 'up' }),
  };
}

describe('DOMAIN_REGISTRY — social edge mount reconciliation', () => {
  it('declares the social edge at the actual served surface (/api/social)', () => {
    expect(DOMAIN_REGISTRY.social.mountBase).toBe('/api/social');
  });

  it('resolves a registry-driven social provider to /api/social in the route table', () => {
    const { mounts, unresolved } = buildRouteTable([registryProvider('social')]);
    expect(unresolved).toHaveLength(0);
    const social = mounts.find((m) => m.spec.providerKey === 'social');
    expect(social?.spec.base).toBe('/api/social');
  });

  it('keeps every registry key mapped to a non-empty, well-formed base (except the edge surface)', () => {
    for (const key of DOMAIN_KEYS) {
      expect(isDomainKey(key)).toBe(true);
      const { mountBase } = DOMAIN_REGISTRY[key];
      if (key === 'edge') {
        expect(mountBase).toBe('');
        continue;
      }
      expect(mountBase.startsWith('/')).toBe(true);
    }
  });
});
