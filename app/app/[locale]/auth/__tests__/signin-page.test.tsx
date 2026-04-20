import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const SignInPage = (await import('../signin/page')).default;

describe('SignInPage', () => {
  it('uses oauth-only signin messaging and removes manual email signin form', () => {
    render(<SignInPage />);

    expect(screen.getByText('OAuth only')).toBeDefined();
    expect(screen.getByText('Email/password sign-in is disabled on the main site. Use GitHub or Google to continue.')).toBeDefined();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByText('Resend verification email')).toBeNull();
  });
});
