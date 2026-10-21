import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression test: the public pricing page's "Get Pro"/"Get Team" CTAs link
 * to /auth/signup?plan=pro|team (site/app/pricing/page.tsx). Before this
 * fix, the signup page only read `redirect`/`return` from the query string
 * and silently dropped `plan`, so a new user who clicked "Get Pro" signed up
 * for the free plan and landed on a generic /dashboard with no path back to
 * checkout — the paid-plan intent from the pricing page was lost. The fix
 * forwards a recognized `plan` into the OAuth callbackURL so the post-signup
 * landing page (/billing/upgrade) can pick up the purchase intent and start
 * checkout automatically.
 */

const { mockSignInSocial } = vi.hoisted(() => ({
  mockSignInSocial: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  signIn: {
    social: mockSignInSocial,
  },
}));

vi.mock('@/components/SiteHeader', () => ({
  SiteHeader: () => <div data-testid="site-header" />,
}));

// Override the global next/navigation mock (vitest.setup.ts) for this file
// only, so useSearchParams reflects a real ?plan=pro query string like the
// pricing page sends.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/auth/signup',
  useSearchParams: () => new URLSearchParams('plan=pro'),
}));

const SignUpPage = (await import('../signup/page')).default;

describe('SignUpPage plan-param forwarding', () => {
  it('forwards a recognized ?plan= into the OAuth callbackURL instead of dropping it', async () => {
    render(<SignUpPage />);

    fireEvent.click(screen.getByText('Continue with GitHub'));

    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'github',
        callbackURL: expect.stringContaining('plan=pro'),
      }),
    );
    // Must not silently default to the plain dashboard when a real plan
    // intent was present on the URL.
    const call = mockSignInSocial.mock.calls[0][0];
    expect(call.callbackURL).not.toBe('/dashboard');
  });
});
