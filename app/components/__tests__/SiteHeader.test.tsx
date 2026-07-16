import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUseSession, mockGetServiceUrlClient } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockGetServiceUrlClient: vi.fn(() => 'https://agents.recoder.xyz'),
}));

vi.mock('@/lib/session-provider', () => ({
  useSession: mockUseSession,
}));

vi.mock('@/lib/config/platforms', () => ({
  getServiceUrlClient: mockGetServiceUrlClient,
}));

vi.mock('@/app/components/LaunchWebIDEButton', () => ({
  LaunchWebIDEButton: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  ),
}));

import { SiteHeader } from '@/components/SiteHeader';

describe('SiteHeader', () => {
  it('shows only Agents and Dashboard nav tabs', () => {
    mockUseSession.mockReturnValue({ data: null });

    render(<SiteHeader fixed={false} />);

    expect(screen.getByText('Agents')).toBeDefined();
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.queryByText('Plan')).toBeNull();
    expect(screen.queryByText('Platform')).toBeNull();
  });
});
