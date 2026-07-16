/**
 * Inference pre-dispatch entitlement (token-quota) gate.
 *
 * Proves the OPTIONAL billing gate seam on the routing service: a wired denying
 * gate REFUSES the completion BEFORE the delivery ladder dispatches (truthful
 * 429-shaped `denied:'quota'` result, gateway never called, nothing charged);
 * no gate wired ⇒ degrade OPEN (pass through); an allowing gate proceeds; a gate
 * EXCEPTION (metering hiccup) degrades OPEN rather than blocking delivery; and a
 * request with no attributable `userId` is not quota-gated.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type {
  DeliveryOutcomeRepository,
  UsageLedgerRepository,
} from '../ports/usage-ledger.port.js';
import type { EntitlementGate } from '../ports/entitlement-gate.port.js';
import type { InferenceRequest } from '../types.js';
import { InferenceRoutingService } from './inference-routing.service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

/** A minimal fake gate: only `checkQuota` is exercised by the routing service. */
function gateWithCheckQuota(checkQuota: EntitlementGate['checkQuota']): EntitlementGate {
  return { checkQuota } as unknown as EntitlementGate;
}

const DENY: Awaited<ReturnType<EntitlementGate['checkQuota']>> = {
  allowed: false,
  plan: 'free',
  kind: 'token',
  limit: 1000,
  remaining: 0,
  resetAt: new Date(0).toISOString(),
  byokBypass: false,
  reason: 'quota_exceeded',
  message: 'token quota exhausted',
};

const ALLOW: Awaited<ReturnType<EntitlementGate['checkQuota']>> = {
  allowed: true,
  plan: 'pro',
  kind: 'token',
  limit: 1_000_000,
  remaining: 999_000,
  resetAt: new Date(0).toISOString(),
  byokBypass: false,
};

function harness() {
  const complete = vi.fn(async () => ({
    routed: true as const,
    tier: 'loopback' as const,
    model: 'openai/gpt-4o-mini',
    content: 'ok',
  }));
  const completeStream = vi.fn(async () => ({
    routed: true as const,
    tier: 'loopback' as const,
    model: 'openai/gpt-4o-mini',
    content: 'ok',
    streamed: true,
    tokenGranular: true,
  }));
  const gateway = {
    complete,
    completeStream,
    embed: vi.fn(),
    health: vi.fn(),
  } as unknown as InferenceGatewayPort;
  const catalog = {
    list: async () => [],
    get: async () => null,
    upsert: vi.fn(),
    setEnabled: vi.fn(),
    isDurable: () => true,
  } as unknown as ModelCatalogRepository;
  const ledger = {
    append: vi.fn(async () => null),
    recentForUser: vi.fn(),
    totalsForUser: vi.fn(),
    isDurable: () => true,
  } as unknown as UsageLedgerRepository;
  const outcomes = {
    append: vi.fn(async () => null),
    recentForUser: vi.fn(),
    isDurable: () => true,
  } as unknown as DeliveryOutcomeRepository;
  const service = new InferenceRoutingService({ logger: log, gateway, catalog, ledger, outcomes });
  return { service, complete, completeStream, ledger };
}

const REQ: InferenceRequest = {
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'hi' }],
  userId: 'u1',
};

describe('inference entitlement token-quota gate', () => {
  it('REFUSES a completion when the gate denies (429-shaped; never dispatched, never charged)', async () => {
    const { service, complete, ledger } = harness();
    const checkQuota = vi.fn(async () => DENY);
    service.setEntitlementGate(gateWithCheckQuota(checkQuota));

    const result = await service.complete(REQ);

    expect(result.routed).toBe(false);
    expect(result.denied).toBe('quota');
    expect(result.tier).toBe('none');
    expect(result.content).toBeNull();
    expect(result.reason).toMatch(/quota/i);
    // Refused PRE-dispatch: the ladder never ran, nothing was charged.
    expect(complete).not.toHaveBeenCalled();
    expect(ledger.append).not.toHaveBeenCalled();
    // The gate saw the real subject + the `token` kind.
    expect(checkQuota).toHaveBeenCalledWith({ subjectId: 'u1', kind: 'user' }, 'token');
  });

  it('REFUSES a streamed completion when the gate denies (no stream fabricated)', async () => {
    const { service, completeStream } = harness();
    service.setEntitlementGate(gateWithCheckQuota(async () => DENY));

    const result = await service.completeStream(REQ, () => {});

    expect(result.routed).toBe(false);
    expect(result.denied).toBe('quota');
    expect(result.streamed).toBe(false);
    expect(result.tokenGranular).toBe(false);
    expect(completeStream).not.toHaveBeenCalled();
  });

  it('PROCEEDS when a wired gate allows the token quota', async () => {
    const { service, complete } = harness();
    service.setEntitlementGate(gateWithCheckQuota(async () => ALLOW));

    const result = await service.complete(REQ);

    expect(result.routed).toBe(true);
    expect(result.content).toBe('ok');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('PASSES THROUGH when no gate is wired (degrade open)', async () => {
    const { service, complete } = harness();

    const result = await service.complete(REQ);

    expect(result.routed).toBe(true);
    expect(result.denied).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('degrades OPEN when the gate throws (a metering hiccup never blocks delivery)', async () => {
    const { service, complete, completeStream } = harness();
    service.setEntitlementGate(
      gateWithCheckQuota(async () => {
        throw new Error('metering repo down');
      }),
    );

    const buffered = await service.complete(REQ);
    const streamed = await service.completeStream(REQ, () => {});

    expect(buffered.routed).toBe(true);
    expect(streamed.routed).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(completeStream).toHaveBeenCalledTimes(1);
  });

  it('does not quota-gate a request with no attributable userId', async () => {
    const { service, complete } = harness();
    const checkQuota = vi.fn(async () => DENY);
    service.setEntitlementGate(gateWithCheckQuota(checkQuota));

    const result = await service.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.routed).toBe(true);
    expect(checkQuota).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
