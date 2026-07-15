/**
 * Preview URL signer tests — the HMAC-signed, expiring preview URL seam. Proves:
 * degrade-safe (unconfigured ⇒ SERVICE_UNAVAILABLE, never a faked URL), a minted
 * token round-trips through verify, a tampered signature is rejected, an expired
 * token is rejected, and the ledger hash is sha256 of the raw token.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createPreviewUrlSigner } from '../services/preview-url-signer.js';
import { sliceCloudConfig, type CloudConfigOverrides } from '../config.js';
import { ErrorCode } from '../../../shared/errors.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceCloudConfig>[0];

function signer(overrides: CloudConfigOverrides = {}, now: () => Date = () => new Date('2026-07-15T00:00:00.000Z')) {
  return createPreviewUrlSigner(sliceCloudConfig(appConfig, overrides), now);
}

const configured: CloudConfigOverrides = {
  previewSigningSecret: 'test_secret_value',
  previewBaseDomain: 'preview.recoder.xyz',
  previewUrlTtlSeconds: 3600,
};

describe('PreviewUrlSigner — configuration gating', () => {
  it('denies signing when no secret/base domain is configured', () => {
    const s = signer();
    expect(s.isConfigured()).toBe(false);
    const r = s.sign('dep_1', 'tnt_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('is configured when secret + base domain are present', () => {
    expect(signer(configured).isConfigured()).toBe(true);
  });
});

describe('PreviewUrlSigner — sign / verify round-trip', () => {
  it('mints a signed URL whose token verifies to the original claims', () => {
    const s = signer(configured);
    const r = s.sign('dep_abc', 'tnt_xyz');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toContain('dep_abc.preview.recoder.xyz');
    expect(r.value.url).toContain('preview_token=');
    const v = s.verify(r.value.token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.deploymentId).toBe('dep_abc');
      expect(v.value.tenantId).toBe('tnt_xyz');
      expect(v.value.exp).toBe(Math.floor(new Date('2026-07-15T00:00:00.000Z').getTime() / 1000) + 3600);
    }
  });

  it('rejects a tampered signature', () => {
    const s = signer(configured);
    const r = s.sign('dep_abc', 'tnt_xyz');
    if (!r.ok) throw new Error('sign failed');
    const tampered = `${r.value.token.split('.')[0]}.deadbeef`;
    const v = s.verify(tampered);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe(ErrorCode.AUTH_INVALID_TOKEN);
  });

  it('rejects a malformed token', () => {
    const v = signer(configured).verify('not-a-token');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe(ErrorCode.AUTH_INVALID_TOKEN);
  });

  it('rejects an expired token (clock advanced past exp)', () => {
    let clock = new Date('2026-07-15T00:00:00.000Z');
    const s = createPreviewUrlSigner(sliceCloudConfig(appConfig, configured), () => clock);
    const r = s.sign('dep_ttl', 'tnt_ttl');
    if (!r.ok) throw new Error('sign failed');
    clock = new Date('2026-07-15T02:00:00.000Z'); // +2h > 1h ttl
    const v = s.verify(r.value.token);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
  });
});

describe('PreviewUrlSigner — ledger hash', () => {
  it('hashToken returns sha256 hex of the raw token (never the token itself)', () => {
    const s = signer(configured);
    const r = s.sign('dep_h', 'tnt_h');
    if (!r.ok) throw new Error('sign failed');
    const expected = createHash('sha256').update(r.value.token, 'utf8').digest('hex');
    const hash = s.hashToken(r.value.token);
    expect(hash).toBe(expected);
    expect(hash).not.toContain(r.value.token);
    expect(hash).toHaveLength(64);
  });
});
