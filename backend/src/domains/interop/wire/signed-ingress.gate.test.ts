import { describe, it, expect } from 'vitest';
import { createSignedIngressGate } from './signed-ingress.gate.js';
import type { SignedIngressConfig, IngressVerifier } from './signed-ingress.gate.js';
import type { IngressResult } from '../types.js';

/** Production-shaped config: signing required, no insecure escape hatch. */
function prodConfig(overrides: Partial<SignedIngressConfig> = {}): SignedIngressConfig {
  return { requireSigned: true, hmacSecret: 's', allowInsecure: false, ...overrides };
}

/** Local-dev-shaped config: unsigned ingress explicitly opted in. */
function devConfig(overrides: Partial<SignedIngressConfig> = {}): SignedIngressConfig {
  return { requireSigned: false, hmacSecret: null, allowInsecure: true, ...overrides };
}

function verifier(result: IngressResult, opts: { throws?: boolean } = {}): IngressVerifier {
  return {
    admit() {
      if (opts.throws) throw new Error('verifier boom');
      return result;
    },
  };
}

const ADMIT: IngressResult = { admitted: true, status: 200, code: 'ok', reason: 'verified', payload: { x: 1 } };
const REJECT: IngressResult = { admitted: false, status: 401, code: 'bad_sig', reason: 'signature invalid' };

describe('createSignedIngressGate — hostile-by-default admission (fail-closed)', () => {
  it('delegates to a wired verifier when it ADMITS', async () => {
    const gate = createSignedIngressGate(prodConfig(), verifier(ADMIT));
    const r = await gate.admit({ any: 'value' });
    expect(r.admitted).toBe(true);
    expect(r.code).toBe('ok');
  });

  it('delegates to a wired verifier when it REJECTS (verifier is authoritative)', async () => {
    const gate = createSignedIngressGate(prodConfig(), verifier(REJECT));
    const r = await gate.admit({ any: 'value' });
    expect(r.admitted).toBe(false);
    expect(r.code).toBe('bad_sig');
  });

  it('FAIL-CLOSED: a verifier that THROWS denies 503 — never admits on fault', async () => {
    const gate = createSignedIngressGate(prodConfig(), verifier(ADMIT, { throws: true }));
    const r = await gate.admit({ any: 'value' });
    expect(r.admitted).toBe(false);
    expect(r.status).toBe(503);
    expect(r.code).toBe('signed_ingress_verifier_fault');
  });

  it('admits UNSIGNED ingress ONLY in the explicit dev escape hatch (allowInsecure + !requireSigned)', async () => {
    const gate = createSignedIngressGate(devConfig());
    const r = await gate.admit({ hello: 'world' });
    expect(r.admitted).toBe(true);
    expect(r.code).toBe('insecure_ingress_allowed');
    expect(r.payload).toEqual({ hello: 'world' });
  });

  it('FAIL-CLOSED: no verifier + requireSigned denies 503 even when allowInsecure is set', async () => {
    const gate = createSignedIngressGate(prodConfig({ allowInsecure: true }));
    const r = await gate.admit({ any: 'value' });
    expect(r.admitted).toBe(false);
    expect(r.status).toBe(503);
    expect(r.code).toBe('signed_ingress_unwired');
  });

  it('FAIL-CLOSED: no verifier + !allowInsecure denies 503 (unwired is a closed door)', async () => {
    const gate = createSignedIngressGate({ requireSigned: false, hmacSecret: null, allowInsecure: false });
    const r = await gate.admit({ any: 'value' });
    expect(r.admitted).toBe(false);
    expect(r.code).toBe('signed_ingress_unwired');
  });
});
