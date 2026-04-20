import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

import { DashboardShellNav } from '@/components/dashboard/dashboard-shell-nav';

describe('DashboardShellNav', () => {
  it('shows only Dashboard and Agents tabs', () => {
    mockUsePathname.mockReturnValue('/dashboard');

    render(<DashboardShellNav />);

    expect(screen.getByTestId('dashboard-shell-nav-dashboard')).toBeDefined();
    expect(screen.getByTestId('dashboard-shell-nav-agents')).toBeDefined();
    expect(screen.queryByText('Platform')).toBeNull();
    expect(screen.queryByText('Plan')).toBeNull();
  });

  it('marks Agents active on agent routes', () => {
    mockUsePathname.mockReturnValue('/agents');

    render(<DashboardShellNav />);

    expect(screen.getByTestId('dashboard-shell-nav-agents').className).toContain('font-medium');
    expect(screen.getByTestId('dashboard-shell-nav-dashboard').className).not.toContain('font-medium');
  });
});
