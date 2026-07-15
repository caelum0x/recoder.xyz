/**
 * The edge route table — the declarative join of "which domains exist + where
 * they mount" ({@link DOMAIN_REGISTRY}) with the concrete {@link RouteProvider}s
 * the container collected. It is pure data assembly: no express, no mounting, no
 * `app.use`. `buildRouteTable(providers)` turns each provider into a
 * {@link MountSpec} + provider pair the composer walks, and surfaces any provider
 * that could not be resolved (no base, or no `routes()`/`mount()`).
 *
 * The cross-cutting {@link GuardPolicy} for a mount is derived by CONVENTION from
 * its base path (`/internal/*` ⇒ internal-key gate + interop; `/api/*` ⇒ session
 * + interop; everything else ⇒ public), with a per-provider override seam so a
 * domain (or bootstrap) can tighten/relax a specific mount without editing this
 * file. The composer compiles the policy into ordered guard links via the chain.
 */
import { DOMAIN_REGISTRY, isDomainKey, DOMAIN_KEYS } from '../../shared/domain-registry.js';
import type { GuardPolicy, MountSpec } from './types.js';
import type { RouteProvider } from './ports/route-provider.port.js';

/** A resolved row: the declarative {@link MountSpec} plus the live provider. */
export interface ResolvedMount {
  readonly spec: MountSpec;
  readonly provider: RouteProvider;
}

/** A provider that could not be turned into a mount, with why (surfaced in health). */
export interface UnresolvedMount {
  readonly key: string;
  readonly reason: string;
}

/** The full table: mountable rows in mount order + the unresolved remainder. */
export interface RouteTable {
  readonly mounts: readonly ResolvedMount[];
  readonly unresolved: readonly UnresolvedMount[];
}

/** Options for the table build (all optional — the convention defaults are safe). */
export interface RouteTableOptions {
  /** Per-provider-key guard override, replacing the convention default for that key. */
  readonly guardOverrides?: Readonly<Record<string, GuardPolicy>>;
  /** Replace the base→policy convention entirely (e.g. for a test harness). */
  readonly defaultGuard?: (base: string, key: string) => GuardPolicy;
}

/**
 * The base→policy convention. Fail-closed by default: `/internal/*` demands the
 * `INTERNAL_SERVICE_KEY` gate + interop admission, `/api/*` demands a resolved
 * session + interop admission, and only non-`/api` system paths (`''`, `/health`,
 * `/_edge`, …) are public. A domain that needs a looser/tighter mount supplies a
 * `guardOverrides[key]`.
 */
export function defaultGuardForBase(base: string): GuardPolicy {
  if (base.startsWith('/internal')) return { auth: 'internal', interop: true };
  if (base.startsWith('/api')) return { auth: 'session', interop: true };
  return { auth: 'public', interop: false };
}

/** Resolve a provider's mount base: explicit `basePath`, else the registry default. */
function resolveBase(provider: RouteProvider): string | null {
  if (typeof provider.basePath === 'string') return provider.basePath;
  if (isDomainKey(provider.key)) return DOMAIN_REGISTRY[provider.key].mountBase;
  return null;
}

/** Stable ordering key: registry/build order for known domains, then insertion. */
function orderIndex(key: string): number {
  const idx = (DOMAIN_KEYS as readonly string[]).indexOf(key);
  return idx === -1 ? DOMAIN_KEYS.length : idx;
}

/**
 * Assemble the route table from the collected providers. Providers are ordered by
 * domain build order (unknown keys last, keeping their relative insertion order);
 * a provider with no resolvable base or neither `routes()` nor `mount()` lands in
 * `unresolved` (the composer records it as a `missing` mount in edge health).
 */
export function buildRouteTable(
  providers: readonly RouteProvider[],
  options: RouteTableOptions = {},
): RouteTable {
  const guardOf = (base: string, key: string): GuardPolicy => {
    const override = options.guardOverrides?.[key];
    if (override) return override;
    return (options.defaultGuard ?? defaultGuardForBase)(base, key);
  };

  const mounts: ResolvedMount[] = [];
  const unresolved: UnresolvedMount[] = [];

  const ordered = providers
    .map((provider, insertion) => ({ provider, insertion }))
    .sort((a, b) => {
      const byOrder = orderIndex(a.provider.key) - orderIndex(b.provider.key);
      return byOrder !== 0 ? byOrder : a.insertion - b.insertion;
    });

  for (const { provider } of ordered) {
    const base = resolveBase(provider);
    if (base === null) {
      unresolved.push({ key: provider.key, reason: 'no basePath and no DOMAIN_REGISTRY mount base' });
      continue;
    }
    const hasRoutes = typeof provider.routes === 'function';
    const hasMount = typeof provider.mount === 'function';
    if (!hasRoutes && !hasMount) {
      unresolved.push({ key: provider.key, reason: 'provider exposes neither routes() nor mount()' });
      continue;
    }
    const guard = guardOf(base, provider.key);
    const spec: MountSpec = {
      base,
      providerKey: provider.key,
      guard,
      ...(base.startsWith('/internal') ? { internal: true } : {}),
    };
    mounts.push({ spec, provider });
  }

  return { mounts, unresolved };
}
