/**
 * DNS/TLS domain verifier adapter — fake-resolver + fake-TLS driven.
 *
 * Proves (no real DNS/TLS on the box): ownership is asserted ONLY when every
 * expected TXT challenge is observed live; a missing/absent record is a truthful
 * `verified:false` (never faked); an infra resolver fault is `verified:false`
 * with a resolver reason; TLS is `active` ONLY when a valid cert is actually
 * served, else `pending` after ownership, `none` before it; and the adapter
 * never throws even when the injected probes reject.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDnsTlsVerifier, type ResolveTxtFn, type TlsProbeFn } from '../adapters/dns-verifier.adapter.js';
import type { DnsRecord } from '../types.js';

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

const CHALLENGE: DnsRecord[] = [
  { type: 'TXT', name: '_recoder-challenge.app.example.com', value: 'recoder-verify=TOKEN123' },
  { type: 'CNAME', name: 'app.example.com', value: 'preview.recoder.xyz' },
];

const okTls: TlsProbeFn = async () => ({ valid: true });

describe('createDnsTlsVerifier', () => {
  it('verifies + reports TLS active when the TXT is published and a valid cert is served', async () => {
    const resolveTxt: ResolveTxtFn = vi.fn(async (name) =>
      name === '_recoder-challenge.app.example.com' ? ['recoder-verify=TOKEN123'] : [],
    );
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe: okTls });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res).toEqual({ verified: true, tls: 'active' });
    // Only the TXT challenge is resolved (the CNAME is not an ownership check).
    expect(resolveTxt).toHaveBeenCalledTimes(1);
  });

  it('verifies but reports TLS pending when the cert is not yet live', async () => {
    const resolveTxt: ResolveTxtFn = async () => ['recoder-verify=TOKEN123'];
    const tlsProbe: TlsProbeFn = async () => ({ valid: false, reason: 'cert_not_yet_valid' });
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res.verified).toBe(true);
    expect(res.tls).toBe('pending');
    expect(res.reason).toBe('cert_not_yet_valid');
  });

  it('tolerates chunked TXT records (chunks are joined before comparison)', async () => {
    // The default resolver joins chunks; a fake that already returns the joined value.
    const resolveTxt: ResolveTxtFn = async () => ['recoder-verify=TOKEN123', 'unrelated=value'];
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe: okTls });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res.verified).toBe(true);
  });

  it('never fakes verified when the TXT record is absent (tls none)', async () => {
    const resolveTxt: ResolveTxtFn = async () => ['recoder-verify=WRONG'];
    const tlsProbe = vi.fn(okTls);
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res).toEqual({ verified: false, tls: 'none', reason: 'txt_record_missing' });
    // TLS is never probed until ownership is proven.
    expect(tlsProbe).not.toHaveBeenCalled();
  });

  it('maps an NXDOMAIN resolver rejection to a truthful missing record (not an infra fault)', async () => {
    const resolveTxt: ResolveTxtFn = async () => {
      throw Object.assign(new Error('queryTxt ENOTFOUND'), { code: 'ENOTFOUND' });
    };
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe: okTls });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res).toEqual({ verified: false, tls: 'none', reason: 'txt_record_missing' });
  });

  it('reports a resolver_error reason on a non-DNS infra fault (never throws)', async () => {
    const resolveTxt: ResolveTxtFn = async () => {
      throw Object.assign(new Error('ETIMEOUT'), { code: 'ETIMEOUT' });
    };
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe: okTls });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res.verified).toBe(false);
    expect(res.tls).toBe('none');
    expect(res.reason).toBe('resolver_error:ETIMEOUT');
  });

  it('reports pending (never active) when the TLS probe itself throws', async () => {
    const resolveTxt: ResolveTxtFn = async () => ['recoder-verify=TOKEN123'];
    const tlsProbe: TlsProbeFn = async () => {
      throw new Error('boom');
    };
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe });
    const res = await verifier.verify('app.example.com', CHALLENGE);
    expect(res.verified).toBe(true);
    expect(res.tls).toBe('pending');
    expect(res.reason).toBe('tls_probe_error');
  });

  it('refuses to assert ownership when there is no TXT challenge to check', async () => {
    const resolveTxt = vi.fn<ResolveTxtFn>(async () => []);
    const verifier = createDnsTlsVerifier({ logger, resolveTxt, tlsProbe: okTls });
    const res = await verifier.verify('app.example.com', [
      { type: 'CNAME', name: 'app.example.com', value: 'preview.recoder.xyz' },
    ]);
    expect(res).toEqual({ verified: false, tls: 'none', reason: 'no_txt_challenge' });
    expect(resolveTxt).not.toHaveBeenCalled();
  });
});
