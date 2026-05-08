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

const SignUpPage = (await import('../signup/page')).default;

describe('SignUpPage', () => {
  it('uses oauth-only signup messaging, provides a softer fallback path, and removes manual email signup form', () => {
    render(<SignUpPage />);

    expect(screen.getByText('OAuth only')).toBeDefined();
    expect(screen.getByText('Email/password sign-up is disabled on the main site. Use GitHub or Google to create your account.')).toBeDefined();
    expect(screen.getByText('Not ready to connect an account yet?')).toBeDefined();
    expect(screen.getByText('Need proof before creating an account?')).toBeDefined();
    expect(screen.queryByLabelText('Full Name')).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByText('Send me a temporary password via email')).toBeNull();
  });
});
