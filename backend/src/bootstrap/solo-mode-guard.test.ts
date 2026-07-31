import { describe, it, expect } from 'vitest';
import {
  assertSoloModeSafe,
  soloModeGuardErrors,
  isLoopbackHost,
  isMultiTenantDbUrl,
} from './solo-mode-guard.js';

describe('solo-mode boot guardrail (item #19 — fail-open on a shared host)', () => {
  it('a loopback desktop with no DB boots (the sanctioned solo shape)', () => {
    expect(
      soloModeGuardErrors({ soloMode: true, host: '127.0.0.1', databaseUrl: null, authDatabaseUrl: null }),
    ).toEqual([]);
    expect(() =>
      assertSoloModeSafe({ soloMode: true, host: '127.0.0.1', databaseUrl: null, authDatabaseUrl: null }),
    ).not.toThrow();
  });

  it('a loopback desktop with a LOOPBACK DB still boots (single machine)', () => {
    expect(
      soloModeGuardErrors({
        soloMode: true,
        host: 'localhost',
        databaseUrl: 'postgres://127.0.0.1:5432/recoder',
        authDatabaseUrl: null,
      }),
    ).toEqual([]);
  });

  it('REFUSES solo-mode bound to a non-loopback address (0.0.0.0 = all interfaces)', () => {
    expect(() =>
      assertSoloModeSafe({ soloMode: true, host: '0.0.0.0', databaseUrl: null, authDatabaseUrl: null }),
    ).toThrow(/RECODER_SOLO_MODE/);
  });

  it('REFUSES solo-mode against a remote/shared multi-tenant DATABASE_URL', () => {
    const errors = soloModeGuardErrors({
      soloMode: true,
      host: '127.0.0.1',
      databaseUrl: 'postgres://db.internal:5432/recoder_main',
      authDatabaseUrl: null,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(() =>
      assertSoloModeSafe({
        soloMode: true,
        host: '127.0.0.1',
        databaseUrl: 'postgres://db.internal:5432/recoder_main',
        authDatabaseUrl: null,
      }),
    ).toThrow(/multi-tenant|shared/i);
  });

  it('REFUSES solo-mode against a remote/shared AUTH_DATABASE_URL', () => {
    expect(() =>
      assertSoloModeSafe({
        soloMode: true,
        host: '127.0.0.1',
        databaseUrl: null,
        authDatabaseUrl: 'postgres://auth.example.com/auth',
      }),
    ).toThrow(/RECODER_SOLO_MODE/);
  });

  it('is a NO-OP when solo mode is off (cloud deploy is untouched)', () => {
    expect(
      soloModeGuardErrors({
        soloMode: false,
        host: '0.0.0.0',
        databaseUrl: 'postgres://db.internal:5432/recoder_main',
        authDatabaseUrl: 'postgres://auth.example.com/auth',
      }),
    ).toEqual([]);
  });

  it('isLoopbackHost: classifies loopback vs external correctly', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('127.0.0.5')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('10.0.0.4')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
  });

  it('isMultiTenantDbUrl: sqlite/file/loopback are single-tenant; remote is not', () => {
    expect(isMultiTenantDbUrl(null)).toBe(false);
    expect(isMultiTenantDbUrl('sqlite:///tmp/x.db')).toBe(false);
    expect(isMultiTenantDbUrl('file:./local.db')).toBe(false);
    expect(isMultiTenantDbUrl('postgres://localhost:5432/x')).toBe(false);
    expect(isMultiTenantDbUrl('postgres://127.0.0.1:5432/x')).toBe(false);
    expect(isMultiTenantDbUrl('postgres://db.internal:5432/x')).toBe(true);
  });
});
