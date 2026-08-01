import { describe, it, expect } from 'vitest';
import {
  sliceGovernanceConfig,
  governanceConfigSchema,
  type GovernanceConfigOverrides,
} from '../config.js';
import type { AppConfig } from '../../../shared/app-config.js';

/**
 * Minimal `AppConfig` double. `sliceGovernanceConfig` only reaches three fields
 * (`internal.serviceKeyPresent`, `runtime.isProduction`, `runtime.soloMode`); the
 * rest of the config shape is irrelevant to the derived governance posture, so we
 * inject just those and cast — this keeps the fixture honest about what the code
 * under test actually consumes.
 */
function fakeApp(opts: {
  isProduction?: boolean;
  soloMode?: unknown;
  serviceKeyPresent?: boolean;
} = {}): AppConfig {
  return {
    runtime: {
      isProduction: opts.isProduction ?? false,
      // Intentionally `unknown` so tests can feed undefined/falsey values and
      // assert the strict `=== true` narrowing on `soloMode`.
      soloMode: opts.soloMode as boolean,
    },
    internal: {
      serviceKeyPresent: opts.serviceKeyPresent ?? false,
    },
  } as unknown as AppConfig;
}

describe('sliceGovernanceConfig — fail-safe governance posture derivation', () => {
  it('FAIL-SAFE: vaultMasterKey defaults to null (secrets engine reports down, never a faked write)', () => {
    const slice = sliceGovernanceConfig(fakeApp());
    expect(slice.vaultMasterKey).toBeNull();
  });

  it('FAIL-SAFE: auditEnabled defaults to true (Merkle audit sealing on by default)', () => {
    const slice = sliceGovernanceConfig(fakeApp());
    expect(slice.auditEnabled).toBe(true);
  });

  it('PRODUCTION HARDENING: allowInsecureDaemon is false in production with no override', () => {
    const slice = sliceGovernanceConfig(fakeApp({ isProduction: true }));
    expect(slice.allowInsecureDaemon).toBe(false);
    expect(slice.isProduction).toBe(true);
  });

  it('DEV DEFAULT: allowInsecureDaemon is true outside production and isProduction is mirrored onto the slice', () => {
    const slice = sliceGovernanceConfig(fakeApp({ isProduction: false }));
    expect(slice.allowInsecureDaemon).toBe(true);
    expect(slice.isProduction).toBe(false);
  });

  it('DEGRADE-SAFE: napiEnabled defaults to true and daemonSocketPath defaults to null', () => {
    const slice = sliceGovernanceConfig(fakeApp());
    expect(slice.napiEnabled).toBe(true);
    expect(slice.daemonSocketPath).toBeNull();
  });

  it('overrides win: every injected override is reflected exactly on the returned slice', () => {
    const overrides: GovernanceConfigOverrides = {
      vaultMasterKey: 'k',
      auditEnabled: false,
      allowInsecureDaemon: true,
      daemonSocketPath: '/tmp/x',
      napiEnabled: false,
    };
    // Use production to prove the override for allowInsecureDaemon truly wins
    // over the prod-hardened default (which would otherwise force false).
    const slice = sliceGovernanceConfig(fakeApp({ isProduction: true }), overrides);
    expect(slice.vaultMasterKey).toBe('k');
    expect(slice.auditEnabled).toBe(false);
    expect(slice.allowInsecureDaemon).toBe(true);
    expect(slice.daemonSocketPath).toBe('/tmp/x');
    expect(slice.napiEnabled).toBe(false);
  });

  it('internalServiceKeyPresent is taken from app.internal.serviceKeyPresent (true)', () => {
    const slice = sliceGovernanceConfig(fakeApp({ serviceKeyPresent: true }));
    expect(slice.internalServiceKeyPresent).toBe(true);
  });

  it('internalServiceKeyPresent is taken from app.internal.serviceKeyPresent (false)', () => {
    const slice = sliceGovernanceConfig(fakeApp({ serviceKeyPresent: false }));
    expect(slice.internalServiceKeyPresent).toBe(false);
  });

  it('soloMode is true ONLY on a strict === true runtime flag', () => {
    expect(sliceGovernanceConfig(fakeApp({ soloMode: true })).soloMode).toBe(true);
  });

  it('soloMode is false for undefined / falsey / non-boolean-truthy runtime.soloMode (strict ===)', () => {
    expect(sliceGovernanceConfig(fakeApp({ soloMode: undefined })).soloMode).toBe(false);
    expect(sliceGovernanceConfig(fakeApp({ soloMode: false })).soloMode).toBe(false);
    // A truthy non-boolean (e.g. the string "true") must NOT satisfy the gate —
    // fail-closed against loosely-typed config drift.
    expect(sliceGovernanceConfig(fakeApp({ soloMode: 'true' })).soloMode).toBe(false);
    expect(sliceGovernanceConfig(fakeApp({ soloMode: 1 })).soloMode).toBe(false);
  });

  it('the returned slice satisfies governanceConfigSchema', () => {
    const slice = sliceGovernanceConfig(fakeApp({ isProduction: true, serviceKeyPresent: true }));
    // Re-parsing the produced object must succeed — the derivation is schema-valid.
    expect(() => governanceConfigSchema.parse(slice)).not.toThrow();
    const parsed = governanceConfigSchema.parse(slice);
    expect(parsed).toEqual(slice);
  });

  it('governanceConfigSchema rejects a structurally-invalid (non-boolean) derived value', () => {
    const slice = sliceGovernanceConfig(fakeApp());
    const malformed = { ...slice, auditEnabled: 'yes' as unknown as boolean };
    // Guards against silently accepting malformed config: a non-boolean must throw.
    expect(() => governanceConfigSchema.parse(malformed)).toThrow();
  });
});
