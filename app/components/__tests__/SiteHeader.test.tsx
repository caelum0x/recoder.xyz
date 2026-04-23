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

import { SiteHeader } from '@/components/SiteHeader';

describe('SiteHeader', () => {
  it('shows the public shell nav without pricing noise', () => {
    mockUseSession.mockReturnValue({ data: null });

    render(<SiteHeader fixed={false} />);

    expect(screen.getByText('Docs')).toBeDefined();
    expect(screen.getByText('Security')).toBeDefined();
    expect(screen.getByText('Agents')).toBeDefined();
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.queryByText('Pricing')).toBeNull();
    expect(screen.queryByText('Launch Web IDE')).toBeNull();
  });
});
