import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import LoginForm from '@/components/auth/login-form';
import { AuthProvider } from '@/lib/auth/auth-context';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/auth/signin',
}));

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
}));

const renderWithAuth = (component: React.ReactElement) => {
  return render(
    <AuthProvider>
      {component}
    </AuthProvider>
  );
};

describe('Authentication Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LoginForm', () => {
    it('renders login form correctly', () => {
      renderWithAuth(<LoginForm />);
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('validates required fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'invalid-email');
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
      });
    });

    it('submits form with valid data', async () => {
      const mockSignIn = vi.fn();
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false,
        });
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);
      
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });

    it('handles login errors', async () => {
      const mockSignIn = vi.fn().mockResolvedValue({
        error: 'Invalid credentials',
        ok: false,
      });
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    it('toggles password visibility', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const passwordInput = screen.getByLabelText(/password/i);
      const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i });
      
      expect(passwordInput).toHaveAttribute('type', 'password');
      
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
      
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('handles remember me functionality', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const rememberCheckbox = screen.getByLabelText(/remember me/i);
      
      expect(rememberCheckbox).not.toBeChecked();
      
      await user.click(rememberCheckbox);
      expect(rememberCheckbox).toBeChecked();
    });

    it('redirects to forgot password page', async () => {
      const mockPush = vi.fn();
      vi.mocked(require('next/navigation').useRouter).mockReturnValue({
        push: mockPush,
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        replace: vi.fn(),
      });
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i });
      await user.click(forgotPasswordLink);
      
      expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password');
    });
  });

  describe('OAuth Buttons', () => {
    it('renders OAuth provider buttons', () => {
      renderWithAuth(<LoginForm />);
      
      expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue with discord/i })).toBeInTheDocument();
    });

    it('initiates GitHub OAuth flow', async () => {
      const mockSignIn = vi.fn();
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const githubButton = screen.getByRole('button', { name: /continue with github/i });
      await user.click(githubButton);
      
      expect(mockSignIn).toHaveBeenCalledWith('github', { callbackUrl: '/' });
    });

    it('initiates Google OAuth flow', async () => {
      const mockSignIn = vi.fn();
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const googleButton = screen.getByRole('button', { name: /continue with google/i });
      await user.click(googleButton);
      
      expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });
    });
  });

  describe('Form Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      
      expect(emailInput).toHaveAttribute('aria-describedby');
      expect(passwordInput).toHaveAttribute('aria-describedby');
    });

    it('associates error messages with form fields', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        const emailInput = screen.getByLabelText(/email/i);
        const emailError = screen.getByText(/email is required/i);
        
        expect(emailInput).toHaveAttribute('aria-describedby', expect.stringContaining(emailError.id));
      });
    });

    it('supports keyboard navigation', async () => {
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Tab through form elements
      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);
      
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      expect(document.activeElement).toBe(passwordInput);
      
      fireEvent.keyDown(passwordInput, { key: 'Tab' });
      // Submit button should be next in tab order
    });

    it('submits form on Enter key press', async () => {
      const mockSignIn = vi.fn();
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.keyboard('{Enter}');
      
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
      });
    });
  });

  describe('Form Validation Edge Cases', () => {
    it('trims whitespace from email input', async () => {
      const mockSignIn = vi.fn();
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(emailInput, '  test@example.com  ');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false,
        });
      });
    });

    it('prevents submission during loading state', async () => {
      const mockSignIn = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
      vi.mocked(require('next-auth/react').signIn).mockImplementation(mockSignIn);
      
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);
      
      // Button should be disabled during loading
      expect(submitButton).toBeDisabled();
      
      // Additional clicks should not trigger more submissions
      await user.click(submitButton);
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });

    it('clears errors when user starts typing', async () => {
      const user = userEvent.setup();
      renderWithAuth(<LoginForm />);
      
      const emailInput = screen.getByLabelText(/email/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Trigger validation error
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
      
      // Start typing should clear error
      await user.type(emailInput, 't');
      
      await waitFor(() => {
        expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
      });
    });
  });
});
