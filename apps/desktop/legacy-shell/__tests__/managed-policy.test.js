/**
 * managed-policy tests — pure, fail-closed policy parsing + per-OS path + load.
 * No Electron, no real fs.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DEFAULT_POLICY, parseManagedPolicy, managedPolicyPath, loadManagedPolicy } = require('../managed-policy.js');

describe('parseManagedPolicy (fail-closed)', () => {
  it('returns conservative defaults for empty/absent input', () => {
    const p = parseManagedPolicy(undefined);
    expect(p.updateChannels).toEqual(['stable']);
    expect(p.backendMode).toBe('embedded');
    expect(p.telemetry.enabled).toBe(false);
    expect(p.features).toEqual({});
    expect(p.retentionDays).toBe(90);
    expect(p.source).toBe('default');
  });

  it('marks source "managed" and keeps valid fields', () => {
    const p = parseManagedPolicy({
      updateChannels: ['stable', 'enterprise'],
      backendMode: 'fleet',
      fleetEndpoint: 'https://fleet.acme.internal',
      telemetry: { enabled: true, otlpEndpoint: 'https://otlp.acme', siemSink: 'splunk' },
      retentionDays: 365,
      features: { advancedAnalytics: true },
    });
    expect(p.source).toBe('managed');
    expect(p.updateChannels).toEqual(['stable', 'enterprise']);
    expect(p.backendMode).toBe('fleet');
    expect(p.telemetry.enabled).toBe(true);
    expect(p.retentionDays).toBe(365);
  });

  it('drops unknown update channels and never yields an empty allowlist', () => {
    const p = parseManagedPolicy({ updateChannels: ['stable', 'nightly', 'canary'] });
    expect(p.updateChannels).toEqual(['stable']);
    const q = parseManagedPolicy({ updateChannels: ['bogus'] });
    expect(q.updateChannels).toEqual(['stable']); // fail-closed to stable, not empty
  });

  it('falls back to embedded for an unknown backend mode', () => {
    expect(parseManagedPolicy({ backendMode: 'root' }).backendMode).toBe('embedded');
  });

  it('coerces invalid telemetry/retention to safe defaults', () => {
    const p = parseManagedPolicy({ telemetry: 'yes', retentionDays: -5 });
    expect(p.telemetry.enabled).toBe(false);
    expect(p.retentionDays).toBe(90);
  });

  it('returns a deeply frozen policy', () => {
    const p = parseManagedPolicy({ backendMode: 'self_host' });
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.telemetry)).toBe(true);
    expect(() => { p.backendMode = 'x'; }).toThrow();
  });
});

describe('managedPolicyPath', () => {
  it('returns per-OS machine-scoped paths', () => {
    expect(managedPolicyPath('darwin')).toContain('/Library/Managed Preferences/');
    expect(managedPolicyPath('linux')).toBe('/etc/recoder/managed-policy.json');
    expect(managedPolicyPath('win32').toLowerCase()).toContain('programdata');
  });
});

describe('loadManagedPolicy (fail-closed on any error)', () => {
  it('returns DEFAULT_POLICY when the file is missing', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => { throw new Error('ENOENT'); },
    });
    expect(p).toEqual(DEFAULT_POLICY);
  });

  it('parses a present, valid policy file', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => JSON.stringify({ backendMode: 'self_host' }),
    });
    expect(p.backendMode).toBe('self_host');
    expect(p.source).toBe('managed');
  });

  it('returns DEFAULT_POLICY on malformed JSON (never throws)', () => {
    const p = loadManagedPolicy({
      platform: 'linux',
      readFileSync: () => '{ not json',
    });
    expect(p).toEqual(DEFAULT_POLICY);
  });
});
