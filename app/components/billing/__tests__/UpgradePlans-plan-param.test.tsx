// @vitest-environment jsdom
/**
 * Second half of the pricing->signup->checkout funnel fix (see
 * app/[locale]/auth/__tests__/signup-page-plan-param.test.tsx for the first
 * half). The signup page now forwards a recognized ?plan= into
 * /billing/upgrade?plan=<id> as the post-OAuth landing URL. This page must
 * actually consume that param and start checkout automatically for a free
 * user who arrives with purchase intent already expressed on the pricing
 * page — otherwise the forwarded plan is still a dead end.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useBillingData: vi.fn(),
}));

vi.mock('../useBillingData', () => ({
  useBillingData: mocks.useBillingData,
  planDisplayName: (planId: string) => (planId === 'free' ? 'Free' : planId),
  isPaidPlan: (planId: string) => planId !== 'free',
}));

// Override the global next/navigation mock for this file only, so
// useSearchParams reflects a real ?plan=pro query string forwarded from the
// signup redirect.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/billing/upgrade',
  useSearchParams: () => new URLSearchParams('plan=pro'),
}));

import { UpgradePlans } from '../UpgradePlans';

function withFreePlan() {
  mocks.useBillingData.mockReturnValue({
    data: {
      subscription: {
        plan: 'free',
        status: 'active',
        currentPeriodEnd: '',
        cancelAtPeriodEnd: false,
        amount: 0,
        currency: 'USD',
      },
      usage: { requests: 0, tokens: 0, cost: 0 },
      nextPayment: null,
      paymentMethod: null,
    },
    loading: false,
    error: null,
    reload: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('UpgradePlans ?plan= auto-checkout', () => {
  it('auto-starts Dodo checkout for a plan forwarded from the pricing/signup funnel', async () => {
    withFreePlan();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, checkoutUrl: 'https://checkout.dodopayments.com/session/abc' }),
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const assignMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: assignMock });

    render(<UpgradePlans />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/create-checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ plan: 'pro', paymentMethod: 'dodo' }),
      })
    );
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.dodopayments.com/session/abc'));
  });
});
