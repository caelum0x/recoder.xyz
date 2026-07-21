import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitSubscriptionCreated, emitCheckoutStarted } from '../conversions';
import { AnalyticsEvents } from '../events';
import * as tracker from '../tracker';

describe('emitSubscriptionCreated (degrade-truthful)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits SUBSCRIPTION_CREATED with the real fields from a verified payload', () => {
    const spy = vi.spyOn(tracker, 'trackServerEvent').mockImplementation(() => {});

    const emitted = emitSubscriptionCreated({
      userId: 'user_123',
      planId: 'monthly',
      priceAmount: 20,
      currency: 'USD',
      provider: 'dodo',
    });

    expect(emitted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(AnalyticsEvents.SUBSCRIPTION_CREATED, {
      userId: 'user_123',
      planId: 'monthly',
      priceAmount: 20,
      currency: 'USD',
      provider: 'dodo',
    });
  });

  it('drops undefined amount/currency instead of recording placeholders', () => {
    const spy = vi.spyOn(tracker, 'trackServerEvent').mockImplementation(() => {});

    emitSubscriptionCreated({
      userId: 'user_123',
      planId: 'pro',
      priceAmount: undefined,
      currency: undefined,
      provider: 'paddle',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, props] = spy.mock.calls[0];
    expect(props).toEqual({ userId: 'user_123', planId: 'pro', provider: 'paddle' });
    expect(props).not.toHaveProperty('priceAmount');
    expect(props).not.toHaveProperty('currency');
  });

  it('drops a non-finite priceAmount (e.g. NaN from a bad parse)', () => {
    const spy = vi.spyOn(tracker, 'trackServerEvent').mockImplementation(() => {});

    emitSubscriptionCreated({
      userId: 'user_123',
      planId: 'pro',
      priceAmount: Number.NaN,
      provider: 'paddle',
    });

    const [, props] = spy.mock.calls[0];
    expect(props).not.toHaveProperty('priceAmount');
  });

  it('is a NO-OP (no event) when there is no real subscriber userId', () => {
    const spy = vi.spyOn(tracker, 'trackServerEvent').mockImplementation(() => {});

    const emitted = emitSubscriptionCreated({
      planId: 'monthly',
      priceAmount: 20,
      currency: 'USD',
      provider: 'dodo',
    });

    expect(emitted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('emitCheckoutStarted (client, no-op without gtag)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards CHECKOUT_STARTED to trackEvent with the real plan fields', () => {
    const spy = vi.spyOn(tracker, 'trackEvent').mockImplementation(() => {});

    emitCheckoutStarted({ planId: 'monthly', priceAmount: 20, currency: 'USD' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(AnalyticsEvents.CHECKOUT_STARTED, {
      planId: 'monthly',
      priceAmount: 20,
      currency: 'USD',
    });
  });
});
