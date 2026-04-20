import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockUseSession, mockLaunchWebIdeButton } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockLaunchWebIdeButton: vi.fn(({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  )),
}));

vi.mock('@/lib/session-provider', () => ({
  useSession: mockUseSession,
}));

vi.mock('@/app/components/LaunchWebIDEButton', () => ({
  LaunchWebIDEButton: mockLaunchWebIdeButton,
}));

const originalFetch = global.fetch;
const DashboardPage = (await import('../page')).default;

describe('DashboardPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('does not call the onboarding redirect probe', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'Test User', email: 'test@example.com' } },
      isPending: false,
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const calledUrls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(calledUrls).not.toContain('/api/onboarding/save');
  });
});
