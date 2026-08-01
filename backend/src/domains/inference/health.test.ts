/**
 * `buildInferenceHealth` — the truthful delivery-ladder + accounting-store health
 * rollup (ARCHITECTURE §10.1). Locks the never-fake-`up` law:
 *   - no tier can serve            ⇒ `down` (regardless of the ledger DB);
 *   - a tier serves, ledger DB down ⇒ `degraded` (delivery works, usage not durable);
 *   - a tier serves, ledger DB up   ⇒ `up`.
 * Also proves the per-engine breakdown (`gateway:<tier>`, `ledger-db`), the
 * structured `detail`, and that a not-`up` rollup carries a composed reason.
 *
 * Pure unit: the gateway is a fake exposing only `health()` returning a scripted
 * `InferenceHealth`; `ledgerDurable` is a plain boolean.
 */
import { describe, it, expect } from 'vitest';
import { buildInferenceHealth } from './health.js';
import type { InferenceGatewayPort } from './ports/inference-gateway.port.js';
import type { InferenceHealth } from './types.js';

/** A gateway double whose only exercised method is `health()`. */
function gatewayWith(health: InferenceHealth): InferenceGatewayPort {
  return { async health() { return health; } } as unknown as InferenceGatewayPort;
}

const NAPI_UP: InferenceHealth = {
  tier: 'napi',
  available: true,
  napiBound: true,
  loopbackConfigured: false,
};

const DOWN: InferenceHealth = {
  tier: 'none',
  available: false,
  napiBound: false,
  loopbackConfigured: false,
  reason: 'napi embedded gateway unbound and no loopback endpoint configured',
};

describe('buildInferenceHealth — rollup law', () => {
  it('reports `up` when a tier serves AND the ledger DB is durable', async () => {
    const health = await buildInferenceHealth({ gateway: gatewayWith(NAPI_UP), ledgerDurable: true });
    expect(health.status).toBe('up');
    expect(health.degraded).toBe(false);
    expect(health.reason).toBeUndefined();
    expect(health.engines).toEqual([
      { name: 'gateway:napi', status: 'up' },
      { name: 'ledger-db', status: 'up' },
    ]);
  });

  it('reports `degraded` (never up) when a tier serves but the ledger DB is unavailable', async () => {
    const health = await buildInferenceHealth({ gateway: gatewayWith(NAPI_UP), ledgerDurable: false });
    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    // gateway still up; ledger-db down with a truthful reason.
    expect(health.engines).toEqual([
      { name: 'gateway:napi', status: 'up' },
      {
        name: 'ledger-db',
        status: 'down',
        reason: 'persistence pool unavailable — usage ledger + delivery outcomes are not durably recorded',
      },
    ]);
    // The composed rollup reason names ONLY the impaired engine.
    expect(health.reason).toContain('ledger-db');
    expect(health.reason).not.toContain('gateway:napi');
  });

  it('reports `down` when no tier can serve — even if the ledger DB is durable', async () => {
    const health = await buildInferenceHealth({ gateway: gatewayWith(DOWN), ledgerDurable: true });
    expect(health.status).toBe('down');
    expect(health.degraded).toBe(true);
    expect(health.engines?.[0]).toEqual({
      name: 'gateway:none',
      status: 'down',
      reason: 'napi embedded gateway unbound and no loopback endpoint configured',
    });
    // ledger-db is still up, but the rollup is down because the gateway can't serve.
    expect(health.engines?.[1]).toEqual({ name: 'ledger-db', status: 'up' });
    expect(health.reason).toContain('gateway:none');
  });

  it('falls back to a default gateway reason when the gateway omits one', async () => {
    const health = await buildInferenceHealth({
      gateway: gatewayWith({ tier: 'none', available: false, napiBound: false, loopbackConfigured: false }),
      ledgerDurable: true,
    });
    expect(health.status).toBe('down');
    expect(health.engines?.[0]?.reason).toBe('no delivery tier available');
  });
});

describe('buildInferenceHealth — structured detail (never secrets)', () => {
  it('surfaces the tier + binding flags and includes optional probe fields when present', async () => {
    const health = await buildInferenceHealth({
      gateway: gatewayWith({
        tier: 'loopback',
        available: true,
        napiBound: false,
        loopbackConfigured: true,
        loopbackReachable: true,
        routerConfigured: false,
      }),
      ledgerDurable: true,
    });
    expect(health.detail).toEqual({
      tier: 'loopback',
      napiBound: false,
      loopbackConfigured: true,
      loopbackReachable: true,
      routerConfigured: false,
    });
  });

  it('omits optional probe fields from detail when the gateway leaves them undefined', async () => {
    const health = await buildInferenceHealth({ gateway: gatewayWith(NAPI_UP), ledgerDurable: true });
    expect(health.detail).toEqual({ tier: 'napi', napiBound: true, loopbackConfigured: false });
    expect(health.detail).not.toHaveProperty('loopbackReachable');
    expect(health.detail).not.toHaveProperty('routerConfigured');
  });

  it('always names the component `inference`', async () => {
    const health = await buildInferenceHealth({ gateway: gatewayWith(DOWN), ledgerDurable: false });
    expect(health.name).toBe('inference');
  });
});
