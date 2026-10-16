// @vitest-environment jsdom
/**
 * UpgradePlans: when every checkout provider refuses the request (the real
 * production state verified 2026-10-16 — Dodo unconfigured, Paddle has no
 * vendor credentials, Creem fails closed by policy), the upgrade flow must
 * not leave an interested payer at a dead end. It should surface a manual
 * mailto fallback to the team's published contact address instead.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useBillingData: vi.fn(),
}));

vi.mock('../useBillingData', () => ({
  useBillingData: mocks.useBillingData,
  planDisplayName: (planId: string) => (planId === 'free' ? 'Free' : planId),
  isPaidPlan: (planId: string) => planId !== 'free',
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

describe('UpgradePlans checkout failure', () => {
  it('offers a mailto fallback to contact@recoder.xyz when every provider refuses checkout', async () => {
    withFreePlan();
    // Both the dodo and paddle attempts (CHECKOUT_PROVIDERS, in order) come
    // back non-ok, exactly like the live 503s from Dodo/Paddle today.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 503, ok: false, json: () => Promise.resolve(null) }))
    );

    render(<UpgradePlans />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro' }));

    const mailLink = await screen.findByRole('link', { name: /email contact@recoder\.xyz/i });
    const href = mailLink.getAttribute('href') ?? '';
    expect(href.startsWith('mailto:contact@recoder.xyz?')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Upgrade to Pro');
    expect(screen.getByText(/Checkout is not available right now/i)).toBeInTheDocument();
  });

  it('does not render the mailto fallback before any checkout attempt', () => {
    withFreePlan();
    render(<UpgradePlans />);
    expect(screen.queryByRole('link', { name: /email contact@recoder\.xyz/i })).not.toBeInTheDocument();
  });
});
