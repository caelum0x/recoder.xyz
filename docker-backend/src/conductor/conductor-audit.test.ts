/**
 * conductor-audit — every mutating conductor route resolves a TenantContext +
 * Principal from the request and emits an AuditEnvelope sealed into the
 * governance Merkle chain. Wires the previously-dormant enterprise tenancy
 * layer (packages/agent-os) into the live control plane (recoder-wh74).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { isLocalTenant } from '@recoder/agent-os';

import {
  resolveConductorTenant,
  resolveConductorPrincipal,
  buildConductorAudit,
} from './conductor-audit';
import { resetRuntimeProfileForTest } from '../runtime-profile';

function req(userId?: string): Request {
  return { userId, headers: {}, params: {}, query: {}, body: {} } as unknown as Request;
}

beforeEach(() => {
  resetRuntimeProfileForTest();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimeProfileForTest();
});

describe('resolveConductorTenant', () => {
  it('embedded (solo) mode → LOCAL_TENANT', () => {
    vi.stubEnv('RECODER_SOLO_MODE', '1');
    expect(isLocalTenant(resolveConductorTenant(req('op')))).toBe(true);
  });

  it('self_host mode → tenant derived from the org header, never local', () => {
    vi.stubEnv('RECODER_SOLO_MODE', '');
    const r = req('user-a');
    (r.headers as Record<string, string>)['x-recoder-org-id'] = 'acme';
    const ctx = resolveConductorTenant(r);
    expect(ctx.orgId).toBe('acme');
    expect(isLocalTenant(ctx)).toBe(false);
  });
});

describe('resolveConductorPrincipal', () => {
  it('maps an internal service identity to a service principal', () => {
    const p = resolveConductorPrincipal(req('internal:worker'));
    expect(p.kind).toBe('service');
    expect(p.principalId).toBe('internal:worker');
  });

  it('maps a normal user id to a user principal', () => {
    const p = resolveConductorPrincipal(req('user-a'));
    expect(p.kind).toBe('user');
    expect(p.principalId).toBe('user-a');
  });

  it('an absent identity is the anonymous/system-less principal (no privileges)', () => {
    const p = resolveConductorPrincipal(req(undefined));
    expect(p.scopes).toEqual([]);
  });
});

describe('buildConductorAudit', () => {
  it('produces a well-formed AuditEnvelope carrying tenant + principal + action', () => {
    vi.stubEnv('RECODER_SOLO_MODE', '1');
    const env = buildConductorAudit(req('op'), {
      action: 'workspace.merge',
      targetId: 'ws_abc',
      outcome: 'allowed',
      now: '2026-07-11T00:00:00.000Z',
    });
    expect(env.action).toBe('workspace.merge');
    expect(env.targetId).toBe('ws_abc');
    expect(env.outcome).toBe('allowed');
    expect(env.tenantId).toBe('local');
    expect(env.principalKind).toBe('user');
    expect(env.recordedAt).toBe('2026-07-11T00:00:00.000Z');
  });
});
