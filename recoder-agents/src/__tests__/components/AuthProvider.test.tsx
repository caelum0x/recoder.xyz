import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock session-token module
vi.mock('@/lib/auth/session-token', () => ({
  getSessionAccessToken: vi.fn(async () => 'mock-token'),
}));

// Mock clear-local-storage
vi.mock('@/lib/utils/clear-local-storage', () => ({
  clearUserLocalStorage: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/components/AuthProvider';
import { clearUserLocalStorage } from '@/lib/utils/clear-local-storage';

const originalFetch = globalThis.fetch;

function AuthConsumer() {
  const { user, isLoading, session, signOut } = useAuth();
  if (isLoading) return <div data-testid="loading">Loading</div>;
  if (!user) return <div data-testid="no-user">No user</div>;
  return (
    <div>
      <div data-testid="user-email">{user.email}</div>
      <div data-testid="user-name">{user.name}</div>
      <div data-testid="user-id">{user.id}</div>
      <div data-testid="has-session">{session ? 'yes' : 'no'}</div>
      <button data-testid="sign-out" onClick={signOut}>
        Sign Out
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows loading state initially', () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: null }), { status: 200 })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toBeDefined();
  });

  it('renders user data from session response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            emailVerified: true,
            name: 'Test User',
            image: 'https://example.com/avatar.png',
          },
        }),
        { status: 200 }
      )
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email').textContent).toBe('test@example.com');
    });

    expect(screen.getByTestId('user-name').textContent).toBe('Test User');
    expect(screen.getByTestId('user-id').textContent).toBe('user-1');
    expect(screen.getByTestId('has-session').textContent).toBe('yes');
  });

  it('handles session response with nested data.user structure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: 'user-2',
              email: 'nested@example.com',
              name: 'Nested User',
            },
          },
        }),
        { status: 200 }
      )
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email').textContent).toBe('nested@example.com');
    });
  });

  it('sets user to null when session response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeDefined();
    });
  });

  it('sets user to null when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeDefined();
    });
  });

  it('sign out clears user state and local storage', async () => {
    // First call: session fetch; subsequent: sign-out
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // Session fetch
        return new Response(
          JSON.stringify({
            user: { id: 'u-1', email: 'a@b.com', name: 'A' },
          }),
          { status: 200 }
        );
      }
      // Sign-out
      return new Response('', { status: 200 });
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email').textContent).toBe('a@b.com');
    });

    await act(async () => {
      screen.getByTestId('sign-out').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeDefined();
    });

    expect(clearUserLocalStorage).toHaveBeenCalled();
  });
});

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    function BadConsumer() {
      useAuth();
      return null;
    }

    expect(() => {
      render(<BadConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});
