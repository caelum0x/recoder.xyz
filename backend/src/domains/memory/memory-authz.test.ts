/**
 * `memory-authz` — tenant-scope authorization predicates for candidate reads.
 *
 * Proves the deny/allow boundary WITHOUT trusting request bodies:
 *  - a plain owner principal is NEVER privileged (strict `proposedBy` scoping),
 *  - only an `internal` service caller OR an `admin`-scoped principal lifts the
 *    tenant filter (the two documented operator bypasses),
 *  - an absent principal is treated as NOT privileged (fail-closed default),
 *  - `soloMode` is carried through verbatim (the desktop single-user fail-open),
 *  - the resolved authz context never fabricates a privileged/solo lift.
 */
import { describe, it, expect } from 'vitest';
import {
  isPrivilegedMemoryPrincipal,
  resolveMemoryReadAuthz,
  type MemoryAuthzPrincipal,
} from './memory-authz.js';

const owner: MemoryAuthzPrincipal = { kind: 'user', scopes: ['read', 'write'] };
const admin: MemoryAuthzPrincipal = { kind: 'user', scopes: ['read', 'admin'] };
const internal: MemoryAuthzPrincipal = { kind: 'internal', scopes: [] };

describe('isPrivilegedMemoryPrincipal', () => {
  it('is NOT privileged for a plain owner principal (strict owner scoping)', () => {
    expect(isPrivilegedMemoryPrincipal(owner)).toBe(false);
  });

  it('is privileged for an internal service-to-service caller', () => {
    expect(isPrivilegedMemoryPrincipal(internal)).toBe(true);
  });

  it('is privileged for an admin-scoped principal', () => {
    expect(isPrivilegedMemoryPrincipal(admin)).toBe(true);
  });

  it('fails CLOSED (not privileged) when the principal is absent', () => {
    expect(isPrivilegedMemoryPrincipal(undefined)).toBe(false);
  });

  it('does NOT treat a near-miss scope as admin (no substring lift)', () => {
    const spoofed: MemoryAuthzPrincipal = { kind: 'user', scopes: ['administrator', 'admin-ish'] };
    expect(isPrivilegedMemoryPrincipal(spoofed)).toBe(false);
  });

  it('does NOT treat a non-internal kind that merely contains "internal" text', () => {
    const spoofed: MemoryAuthzPrincipal = { kind: 'internal-ish', scopes: [] };
    expect(isPrivilegedMemoryPrincipal(spoofed)).toBe(false);
  });
});

describe('resolveMemoryReadAuthz', () => {
  it('leaves a plain owner strictly owner-scoped (privileged:false) when not solo', () => {
    expect(resolveMemoryReadAuthz(owner, false)).toEqual({ privileged: false, soloMode: false });
  });

  it('marks internal/admin operators privileged so they see every tenant', () => {
    expect(resolveMemoryReadAuthz(internal, false).privileged).toBe(true);
    expect(resolveMemoryReadAuthz(admin, false).privileged).toBe(true);
  });

  it('carries soloMode verbatim (desktop single-user plane fails open)', () => {
    expect(resolveMemoryReadAuthz(owner, true)).toEqual({ privileged: false, soloMode: true });
  });

  it('fails CLOSED for an absent principal in a multi-tenant plane', () => {
    expect(resolveMemoryReadAuthz(undefined, false)).toEqual({ privileged: false, soloMode: false });
  });

  it('an absent principal in solo mode is still owner-scoped but fails open via soloMode', () => {
    expect(resolveMemoryReadAuthz(undefined, true)).toEqual({ privileged: false, soloMode: true });
  });
});
