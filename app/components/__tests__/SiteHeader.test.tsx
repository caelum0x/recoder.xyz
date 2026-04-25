import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}));

vi.mock('@/lib/session-provider', () => ({
  useSession: mockUseSession,
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
    expect(screen.getByRole('link', { name: 'Agents' }).getAttribute('href')).toBe('/agents');
    expect(screen.queryByText('Pricing')).toBeNull();
    expect(screen.queryByText('Launch Web IDE')).toBeNull();
  });
});
