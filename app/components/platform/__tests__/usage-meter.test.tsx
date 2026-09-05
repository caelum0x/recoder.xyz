// @vitest-environment jsdom
/**
 * UsageMeter: renders the enforced quota and surfaces the upgrade CTA
 * exactly when the free quota binds (>=80% used, or blocked outright).
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  usePlatformApi: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('../use-platform-api', () => ({
  usePlatformApi: mocks.usePlatformApi,
  PLATFORM_BASE: 'https://recoder.xyz',
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: mocks.trackEvent,
  AnalyticsEvents: { UPGRADE_PROMPTED: 'upgrade_prompted' },
}));

import { UsageMeter } from '../usage-meter';

function withSummary(data: Record<string, unknown> | null) {
  mocks.usePlatformApi.mockReturnValue({ data, error: null, loading: false, refetch: vi.fn() });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UsageMeter', () => {
  it('renders nothing while there is no data (signed out / loading)', () => {
    withSummary(null);
    const { container } = render(<UsageMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for unlimited plans', () => {
    withSummary({ success: true, used: 10, limit: -1, remaining: -1, allowed: true, upgradeRequired: false });
    const { container } = render(<UsageMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the meter without an upgrade CTA at low usage', () => {
    withSummary({ success: true, used: 20, limit: 200, remaining: 180, allowed: true, upgradeRequired: false });
    render(<UsageMeter />);
    expect(screen.getByText('20/200 req')).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade/)).not.toBeInTheDocument();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('shows the upgrade CTA and fires upgrade_prompted when usage crosses 80%', () => {
    withSummary({ success: true, used: 180, limit: 200, remaining: 20, allowed: true, upgradeRequired: false });
    render(<UsageMeter />);
    const cta = screen.getByText('Upgrade — Pro $29/mo');
    expect(cta).toHaveAttribute('href', 'https://recoder.xyz/billing/upgrade');
    expect(mocks.trackEvent).toHaveBeenCalledWith('upgrade_prompted', { promptSurface: 'usage-meter' });
  });

  it('shows the limit-reached CTA when the quota is exhausted', () => {
    withSummary({
      success: true,
      used: 200,
      limit: 200,
      remaining: 0,
      allowed: false,
      upgradeRequired: true,
      upgradeUrl: '/billing/upgrade',
    });
    render(<UsageMeter />);
    expect(screen.getByText('Limit reached — upgrade to Pro $29/mo')).toBeInTheDocument();
  });
});
