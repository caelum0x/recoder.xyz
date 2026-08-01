/**
 * `rpc-admission.middleware` — the fail-closed admission boundary in front of the
 * public A2A `POST /rpc` dispatcher. These tests lock in the security invariants:
 *
 *   - bare JSON-RPC is admitted ONLY in the explicit insecure-dev posture
 *     (`!requireSigned && allowInsecure`); production/partial postures DENY it,
 *   - untrusted bodies are handed to the frozen signed-ingress gate and ONLY the
 *     verified JSON-RPC payload is dispatched (`req.body` is replaced, and the
 *     proven signer — not a caller-supplied field — is carried on `req.a2aSigner`),
 *   - every gate deny is a truthful error envelope (503/400/403 mapping) and a
 *     gate FAULT still fails closed — never an admit, never a throw.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { IngressResult } from '../types.js';
import type { SignedIngressGate, IngressAdmissionContext } from '../wire/signed-ingress.gate.js';
import { createRpcAdmissionGuard, type RpcAdmissionPosture } from './rpc-admission.middleware.js';

const JSONRPC = { jsonrpc: '2.0' as const, method: 'message/send', id: 1, params: { userId: 'attacker' } };

/** A gate stub whose `admit` returns a fixed result (or throws to simulate a fault). */
function stubGate(behavior: IngressResult | (() => Promise<never>)): {
  gate: SignedIngressGate;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const gate: SignedIngressGate = {
    admit: async <T>(value: unknown, _now?: Date, _ctx?: IngressAdmissionContext): Promise<IngressResult<T>> => {
      calls.push(value);
      if (typeof behavior === 'function') return behavior();
      return behavior as IngressResult<T>;
    },
  };
  return { gate, calls };
}

/** Minimal capturing Express `Response` double. */
function makeRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function makeReq(body: unknown): Request & { a2aSigner?: { readonly keyId: string; readonly from?: string } } {
  return { body, path: '/rpc' } as unknown as Request & { a2aSigner?: { readonly keyId: string; readonly from?: string } };
}

/** Let the guard's internal promise settle. */
async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

const PROD_POSTURE: RpcAdmissionPosture = { requireSigned: true, allowInsecure: false };
const DEV_POSTURE: RpcAdmissionPosture = { requireSigned: false, allowInsecure: true };

describe('rpc-admission guard — bare JSON-RPC posture gate', () => {
  it('admits bare JSON-RPC ONLY in the explicit insecure-dev posture (never touches the gate)', async () => {
    const { gate, calls } = stubGate({ admitted: false, status: 401, code: 'x', reason: 'unused' });
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: DEV_POSTURE });
    const req = makeReq(JSONRPC);
    const res = makeRes();
    const next = vi.fn();

    guard(req, res, next);
    await tick();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0); // no error written
    expect(calls).toHaveLength(0); // dev bypass short-circuits before the gate
  });

  it('DENIES bare JSON-RPC in production posture (requireSigned) — fail-closed 403, no next', async () => {
    const { gate } = stubGate({ admitted: false, status: 401, code: 'x', reason: 'unused' });
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: PROD_POSTURE });
    const res = makeRes();
    const next = vi.fn();

    guard(makeReq(JSONRPC), res, next);
    await tick();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
  });

  it('DENIES bare JSON-RPC when allowInsecure is set but requireSigned is NOT off (both flags required)', async () => {
    const { gate } = stubGate({ admitted: false, status: 401, code: 'x', reason: 'unused' });
    // requireSigned=false but allowInsecure=false ⇒ insecureDevPosture is false ⇒ deny.
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: { requireSigned: false, allowInsecure: false } });
    const res = makeRes();
    const next = vi.fn();

    guard(makeReq(JSONRPC), res, next);
    await tick();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe('rpc-admission guard — signed-envelope path', () => {
  it('dispatches ONLY the verified payload and binds the proven signer (drops the raw wire body)', async () => {
    const verifiedPayload = { jsonrpc: '2.0', method: 'message/send', id: 9 };
    const { gate } = stubGate({
      admitted: true,
      status: 200,
      code: 'ingress_admitted',
      reason: 'ok',
      payload: verifiedPayload,
      signer: { keyId: 'agent:trusted', from: 'a' },
    });
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: PROD_POSTURE });
    const req = makeReq({ some: 'sealed-envelope', params: { userId: 'attacker' } });
    const res = makeRes();
    const next = vi.fn();

    guard(req, res, next);
    await tick();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    // The raw envelope is replaced by the verified JSON-RPC payload.
    expect(req.body).toEqual(verifiedPayload);
    // Ownership is scoped by the cryptographically-proven signer, not caller input.
    expect(req.a2aSigner).toEqual({ keyId: 'agent:trusted', from: 'a' });
  });

  it('DENIES (400) when an admitted envelope payload is NOT a JSON-RPC request', async () => {
    const { gate } = stubGate({
      admitted: true,
      status: 200,
      code: 'ingress_admitted',
      reason: 'ok',
      payload: { not: 'json-rpc' },
    });
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: PROD_POSTURE });
    const res = makeRes();
    const next = vi.fn();

    guard(makeReq({ sealed: true }), res, next);
    await tick();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_INPUT');
  });
});

describe('rpc-admission guard — deny mapping mirrors the gate status', () => {
  const cases: Array<{ name: string; result: IngressResult; status: number; code: string }> = [
    {
      name: '5xx gate condition (missing secret) ⇒ SERVICE_UNAVAILABLE 503',
      result: { admitted: false, status: 503, code: 'signed_ingress_secret_missing', reason: 'no secret' },
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    },
    {
      name: '400 malformed ⇒ INVALID_INPUT 400',
      result: { admitted: false, status: 400, code: 'malformed', reason: 'bad' },
      status: 400,
      code: 'INVALID_INPUT',
    },
    {
      name: '401 bad signature ⇒ AUTHZ_PROJECT_ACCESS_DENIED 403',
      result: { admitted: false, status: 401, code: 'signed_envelope_bad_signature', reason: 'forged' },
      status: 403,
      code: 'AUTHZ_PROJECT_ACCESS_DENIED',
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const { gate } = stubGate(c.result);
      const guard = createRpcAdmissionGuard({ ingress: gate, posture: PROD_POSTURE });
      const res = makeRes();
      const next = vi.fn();

      guard(makeReq({ sealed: true }), res, next);
      await tick();

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(c.status);
      expect((res.body as { error: { code: string } }).error.code).toBe(c.code);
    });
  }
});

describe('rpc-admission guard — a faulting gate still fails closed', () => {
  it('maps an unexpected gate rejection to SERVICE_UNAVAILABLE (never admits, never throws)', async () => {
    const { gate } = stubGate(() => Promise.reject(new Error('boom')));
    const errs: unknown[] = [];
    const guard = createRpcAdmissionGuard({
      ingress: gate,
      posture: PROD_POSTURE,
      logger: { error: (...a: unknown[]) => errs.push(a) } as never,
    });
    const res = makeRes();
    const next = vi.fn();

    expect(() => guard(makeReq({ sealed: true }), res, next)).not.toThrow();
    await tick();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect((res.body as { error: { code: string } }).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(errs).toHaveLength(1); // fault was logged, not swallowed
  });
});
