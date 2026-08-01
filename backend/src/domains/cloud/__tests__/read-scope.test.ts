/**
 * read-scope tests — the cross-tenant READ visibility gate (IDOR guard).
 *
 * The full mesh control-plane + fleet manifest is SHARED infra state; exposing
 * it to any authenticated caller lets one tenant enumerate another's sandboxes /
 * deployments. These tests lock in the isolation rule:
 *   - cloud (non-solo): ONLY an `internal`-kind principal or an `admin`/`internal`
 *     scoped caller sees the full fabric; everyone else is tenant-scoped.
 *   - solo/desktop: fails OPEN (one local tenant, so withholding would break the
 *     legitimate owner's mesh/fleet surfaces).
 * The default posture is deny (a plain read/write caller never sees the fabric).
 */
import { describe, it, expect } from 'vitest';
import { principalSeesFullFabric, callerSeesFullFabric } from '../services/read-scope.js';
import type { Principal, PrincipalKind } from '../../identity/types.js';
import type { McpToolCaller } from '../../../shared/module-base.js';

function principal(over: Partial<Principal> = {}): Principal {
  return {
    userId: over.userId ?? 'user_1',
    scopes: over.scopes ?? ['read', 'write'],
    kind: over.kind ?? 'session',
    isAnonymous: over.isAnonymous ?? false,
    raw: null,
    ...over,
  };
}

function caller(scopes?: readonly string[]): McpToolCaller {
  return { userId: 'user_1', scopes } as McpToolCaller;
}

describe('principalSeesFullFabric — cloud (non-solo)', () => {
  it('DENIES a plain read/write session principal (tenant-scoped view only)', () => {
    expect(principalSeesFullFabric(principal({ kind: 'session', scopes: ['read', 'write'] }), false)).toBe(false);
  });

  it('DENIES an apikey principal without a privileged scope', () => {
    expect(principalSeesFullFabric(principal({ kind: 'apikey', scopes: ['read'] }), false)).toBe(false);
  });

  it('DENIES an anonymous fallback principal', () => {
    expect(
      principalSeesFullFabric(principal({ kind: 'anonymous', isAnonymous: true, scopes: [] }), false),
    ).toBe(false);
  });

  it('DENIES when scopes is empty', () => {
    expect(principalSeesFullFabric(principal({ scopes: [] }), false)).toBe(false);
  });

  it('ALLOWS an internal-kind principal regardless of scopes', () => {
    expect(principalSeesFullFabric(principal({ kind: 'internal', scopes: [] }), false)).toBe(true);
  });

  it('ALLOWS a principal carrying the admin scope', () => {
    expect(principalSeesFullFabric(principal({ kind: 'session', scopes: ['read', 'admin'] }), false)).toBe(true);
  });

  it('ALLOWS a principal carrying the internal scope', () => {
    expect(principalSeesFullFabric(principal({ kind: 'apikey', scopes: ['internal'] }), false)).toBe(true);
  });

  it('does NOT treat a look-alike scope (e.g. "administrator") as privileged', () => {
    expect(principalSeesFullFabric(principal({ scopes: ['administrator', 'read-admin'] }), false)).toBe(false);
  });
});

describe('principalSeesFullFabric — solo/desktop fails OPEN', () => {
  it('ALLOWS even an anonymous, unscoped principal in solo mode', () => {
    expect(
      principalSeesFullFabric(principal({ kind: 'anonymous', isAnonymous: true, scopes: [] }), true),
    ).toBe(true);
  });

  it('ALLOWS a plain read-only principal in solo mode', () => {
    expect(principalSeesFullFabric(principal({ scopes: ['read'] }), true)).toBe(true);
  });
});

describe('callerSeesFullFabric — MCP caller (non-solo)', () => {
  it('DENIES an absent caller', () => {
    expect(callerSeesFullFabric(undefined, false)).toBe(false);
  });

  it('DENIES a caller with no scopes field', () => {
    expect(callerSeesFullFabric(caller(undefined), false)).toBe(false);
  });

  it('DENIES a caller with only non-privileged scopes', () => {
    expect(callerSeesFullFabric(caller(['read', 'write']), false)).toBe(false);
  });

  it('ALLOWS a caller with the admin scope', () => {
    expect(callerSeesFullFabric(caller(['admin']), false)).toBe(true);
  });

  it('ALLOWS a caller with the internal scope', () => {
    expect(callerSeesFullFabric(caller(['internal']), false)).toBe(true);
  });
});

describe('callerSeesFullFabric — solo/desktop fails OPEN', () => {
  it('ALLOWS even an absent caller in solo mode', () => {
    expect(callerSeesFullFabric(undefined, true)).toBe(true);
  });

  it('ALLOWS an unscoped caller in solo mode', () => {
    expect(callerSeesFullFabric(caller([]), true)).toBe(true);
  });
});

describe('read-scope — principal vs caller privilege parity', () => {
  it('an internal-KIND principal is privileged even without an internal SCOPE, but an MCP caller needs the scope', () => {
    const p = principal({ kind: 'internal', scopes: [] });
    // Principal path honors kind:'internal'.
    expect(principalSeesFullFabric(p, false)).toBe(true);
    // Caller path has no `kind`; only the scope grants it. Unscoped ⇒ denied.
    expect(callerSeesFullFabric(caller([]), false)).toBe(false);
  });

  const kinds: PrincipalKind[] = ['session', 'apikey', 'device', 'anonymous'];
  for (const kind of kinds) {
    it(`non-internal kind "${kind}" without a privileged scope is denied in cloud mode`, () => {
      expect(principalSeesFullFabric(principal({ kind, scopes: ['read', 'write'] }), false)).toBe(false);
    });
  }
});
