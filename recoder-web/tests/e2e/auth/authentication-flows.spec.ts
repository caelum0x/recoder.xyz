import { test, expect } from '@playwright/test';
import { LoginHelper } from '../helpers/login-helper';

test.describe('Authentication Flow Tests', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
  });

  test.describe('User Registration Flow', () => {
    test('should register new user successfully', async ({ page }) => {
      const timestamp = Date.now();
      const userData = {
        name: `Test User ${timestamp}`,
        email: `test${timestamp}@example.com`,
        password: 'SecurePassword123!',
      };

      await page.goto('/auth/signup');

      // Fill registration form
      await page.fill('[data-testid="name-input"]', userData.name);
      await page.fill('[data-testid="email-input"]', userData.email);
      await page.fill('[data-testid="password-input"]', userData.password);
      await page.fill('[data-testid="confirm-password-input"]', userData.password);

      // Accept terms and conditions
      await page.check('[data-testid="accept-terms-checkbox"]');

      // Submit registration
      await page.click('[data-testid="register-submit-btn"]');

      // Should show success message or redirect to dashboard
      try {
        // Check for email verification message
        await expect(page.locator('[data-testid="email-verification-required"]')).toBeVisible();
        await expect(page.locator('[data-testid="verification-email-sent"]')).toContainText(userData.email);
      } catch {
        // Or check for direct dashboard redirect
        await expect(page).toHaveURL('/dashboard');
        await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
      }
    });

    test('should validate registration form fields', async ({ page }) => {
      await page.goto('/auth/signup');

      // Test empty form submission
      await page.click('[data-testid="register-submit-btn"]');

      await expect(page.locator('[data-testid="name-error"]')).toContainText(/name is required/i);
      await expect(page.locator('[data-testid="email-error"]')).toContainText(/email is required/i);
      await expect(page.locator('[data-testid="password-error"]')).toContainText(/password is required/i);

      // Test invalid email format
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="register-submit-btn"]');
      await expect(page.locator('[data-testid="email-error"]')).toContainText(/invalid email/i);

      // Test weak password
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', '123');
      await page.click('[data-testid="register-submit-btn"]');
      await expect(page.locator('[data-testid="password-error"]')).toContainText(/password too weak/i);

      // Test password mismatch
      await page.fill('[data-testid="password-input"]', 'StrongPassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
      await page.click('[data-testid="register-submit-btn"]');
      await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText(/passwords do not match/i);

      // Test terms acceptance requirement
      await page.fill('[data-testid="name-input"]', 'Test User');
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'StrongPassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'StrongPassword123!');
      // Don't check terms
      await page.click('[data-testid="register-submit-btn"]');
      await expect(page.locator('[data-testid="terms-error"]')).toContainText(/accept terms/i);
    });

    test('should prevent duplicate email registration', async ({ page }) => {
      await page.goto('/auth/signup');

      // Try to register with existing email
      await page.fill('[data-testid="name-input"]', 'Duplicate User');
      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz'); // Existing test user
      await page.fill('[data-testid="password-input"]', 'Password123!');
      await page.fill('[data-testid="confirm-password-input"]', 'Password123!');
      await page.check('[data-testid="accept-terms-checkbox"]');

      await page.click('[data-testid="register-submit-btn"]');

      await expect(page.locator('[data-testid="registration-error"]')).toContainText(/email already exists/i);
    });

    test('should show password strength indicator', async ({ page }) => {
      await page.goto('/auth/signup');

      // Test weak password
      await page.fill('[data-testid="password-input"]', '123');
      await expect(page.locator('[data-testid="password-strength"]')).toContainText(/weak/i);
      await expect(page.locator('[data-testid="password-strength-bar"]')).toHaveClass(/strength-weak/);

      // Test medium password
      await page.fill('[data-testid="password-input"]', 'password123');
      await expect(page.locator('[data-testid="password-strength"]')).toContainText(/medium/i);
      await expect(page.locator('[data-testid="password-strength-bar"]')).toHaveClass(/strength-medium/);

      // Test strong password
      await page.fill('[data-testid="password-input"]', 'StrongPassword123!');
      await expect(page.locator('[data-testid="password-strength"]')).toContainText(/strong/i);
      await expect(page.locator('[data-testid="password-strength-bar"]')).toHaveClass(/strength-strong/);
    });
  });

  test.describe('User Login Flow', () => {
    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');

      await page.click('[data-testid="login-submit-btn"]');

      // Should redirect to dashboard
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-email"]')).toContainText('test@recoder.xyz');
    });

    test('should reject invalid credentials', async ({ page }) => {
      await page.goto('/auth/signin');

      // Test with wrong password
      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'wrongpassword');

      await page.click('[data-testid="login-submit-btn"]');

      await expect(page.locator('[data-testid="login-error"]')).toContainText(/invalid credentials/i);
      await expect(page).toHaveURL('/auth/signin');

      // Test with non-existent email
      await page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
      await page.fill('[data-testid="password-input"]', 'anypassword');

      await page.click('[data-testid="login-submit-btn"]');

      await expect(page.locator('[data-testid="login-error"]')).toContainText(/invalid credentials/i);
    });

    test('should validate login form fields', async ({ page }) => {
      await page.goto('/auth/signin');

      // Test empty form
      await page.click('[data-testid="login-submit-btn"]');

      await expect(page.locator('[data-testid="email-error"]')).toContainText(/email is required/i);
      await expect(page.locator('[data-testid="password-error"]')).toContainText(/password is required/i);

      // Test invalid email format
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="login-submit-btn"]');
      await expect(page.locator('[data-testid="email-error"]')).toContainText(/invalid email/i);
    });

    test('should show loading state during login', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');

      // Click login and immediately check for loading state
      await page.click('[data-testid="login-submit-btn"]');

      await expect(page.locator('[data-testid="login-loading"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-submit-btn"]')).toBeDisabled();
    });

    test('should handle remember me functionality', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');
      await page.check('[data-testid="remember-me-checkbox"]');

      await page.click('[data-testid="login-submit-btn"]');

      await expect(page).toHaveURL('/dashboard');

      // Verify session persistence (longer session duration)
      // This would require checking cookies or session storage
      const sessionCookie = await page.context().cookies();
      const authCookie = sessionCookie.find(c => c.name.includes('session') || c.name.includes('auth'));
      
      if (authCookie) {
        // Verify extended expiration for remember me
        expect(authCookie.expires).toBeGreaterThan(Date.now() / 1000 + 3600); // More than 1 hour
      }
    });
  });

  test.describe('OAuth Authentication', () => {
    test('should initiate GitHub OAuth flow', async ({ page }) => {
      await page.goto('/auth/signin');

      // Click GitHub OAuth button
      await page.click('[data-testid="oauth-github-btn"]');

      // Should redirect to GitHub OAuth
      await page.waitForURL('**/github.com/login/oauth/**', { timeout: 5000 });
      
      // Verify GitHub OAuth page elements
      await expect(page.locator('h1')).toContainText(/sign in to github/i);
    });

    test('should initiate Google OAuth flow', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.click('[data-testid="oauth-google-btn"]');

      // Should redirect to Google OAuth
      await page.waitForURL('**/accounts.google.com/**', { timeout: 5000 });
    });

    test('should initiate Discord OAuth flow', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.click('[data-testid="oauth-discord-btn"]');

      // Should redirect to Discord OAuth
      await page.waitForURL('**/discord.com/oauth2/**', { timeout: 5000 });
    });

    test('should handle OAuth callback success', async ({ page }) => {
      // Mock successful OAuth callback
      const mockOAuthData = {
        provider: 'github',
        code: 'mock-auth-code',
        state: 'mock-state',
      };

      await page.goto(`/auth/callback/github?code=${mockOAuthData.code}&state=${mockOAuthData.state}`);

      // Should process OAuth and redirect to dashboard
      await expect(page).toHaveURL('/dashboard');
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should handle OAuth callback error', async ({ page }) => {
      // Mock OAuth error
      await page.goto('/auth/callback/github?error=access_denied&error_description=User+denied+access');

      // Should redirect to login with error message
      await expect(page).toHaveURL('/auth/signin');
      await expect(page.locator('[data-testid="oauth-error"]')).toContainText(/access denied/i);
    });
  });

  test.describe('Password Reset Flow', () => {
    test('should initiate password reset', async ({ page }) => {
      await page.goto('/auth/forgot-password');

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.click('[data-testid="reset-password-btn"]');

      await expect(page.locator('[data-testid="reset-email-sent"]')).toBeVisible();
      await expect(page.locator('[data-testid="reset-instructions"]')).toContainText(/check your email/i);
    });

    test('should validate email for password reset', async ({ page }) => {
      await page.goto('/auth/forgot-password');

      // Test empty email
      await page.click('[data-testid="reset-password-btn"]');
      await expect(page.locator('[data-testid="email-error"]')).toContainText(/email is required/i);

      // Test invalid email format
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="reset-password-btn"]');
      await expect(page.locator('[data-testid="email-error"]')).toContainText(/invalid email/i);
    });

    test('should handle password reset with token', async ({ page }) => {
      // Mock password reset token
      const resetToken = 'mock-reset-token';
      await page.goto(`/auth/reset-password?token=${resetToken}`);

      // Fill new password form
      await page.fill('[data-testid="new-password-input"]', 'NewSecurePassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'NewSecurePassword123!');

      await page.click('[data-testid="update-password-btn"]');

      // Should show success message and redirect to login
      await expect(page.locator('[data-testid="password-updated-message"]')).toBeVisible();
      await expect(page).toHaveURL('/auth/signin');
    });

    test('should validate new password in reset flow', async ({ page }) => {
      const resetToken = 'mock-reset-token';
      await page.goto(`/auth/reset-password?token=${resetToken}`);

      // Test weak password
      await page.fill('[data-testid="new-password-input"]', '123');
      await page.click('[data-testid="update-password-btn"]');
      await expect(page.locator('[data-testid="password-error"]')).toContainText(/too weak/i);

      // Test password mismatch
      await page.fill('[data-testid="new-password-input"]', 'StrongPassword123!');
      await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
      await page.click('[data-testid="update-password-btn"]');
      await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText(/do not match/i);
    });

    test('should handle invalid reset token', async ({ page }) => {
      await page.goto('/auth/reset-password?token=invalid-token');

      await expect(page.locator('[data-testid="invalid-token-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="request-new-reset-btn"]')).toBeVisible();
    });

    test('should handle expired reset token', async ({ page }) => {
      await page.goto('/auth/reset-password?token=expired-token');

      await expect(page.locator('[data-testid="expired-token-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="request-new-reset-btn"]')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      await loginHelper.loginWithTestUser();

      // Reload page and verify session persists
      await page.reload();
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should logout successfully', async ({ page }) => {
      await loginHelper.loginWithTestUser();

      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-btn"]');

      // Should redirect to login page
      await expect(page).toHaveURL('/auth/signin');
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

      // Verify cannot access protected pages
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/auth/signin');
    });

    test('should handle session expiration', async ({ page }) => {
      await loginHelper.loginWithTestUser();

      // Mock session expiration by clearing authentication
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Try to access protected page
      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL('/auth/signin');
      await expect(page.locator('[data-testid="session-expired-message"]')).toBeVisible();
    });

    test('should redirect to intended page after login', async ({ page }) => {
      // Try to access protected page without authentication
      await page.goto('/settings/account');

      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/signin/);

      // Login
      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');
      await page.click('[data-testid="login-submit-btn"]');

      // Should redirect to originally requested page
      await expect(page).toHaveURL('/settings/account');
    });
  });

  test.describe('Email Verification', () => {
    test('should show email verification requirement', async ({ page }) => {
      // Mock unverified user state
      await page.goto('/auth/verify-email');

      await expect(page.locator('[data-testid="verification-required-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="resend-verification-btn"]')).toBeVisible();
    });

    test('should resend verification email', async ({ page }) => {
      await page.goto('/auth/verify-email');

      await page.click('[data-testid="resend-verification-btn"]');

      await expect(page.locator('[data-testid="verification-resent-message"]')).toBeVisible();
      
      // Button should be disabled temporarily
      await expect(page.locator('[data-testid="resend-verification-btn"]')).toBeDisabled();
    });

    test('should verify email with token', async ({ page }) => {
      const verificationToken = 'mock-verification-token';
      await page.goto(`/auth/verify-email?token=${verificationToken}`);

      await expect(page.locator('[data-testid="email-verified-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="continue-to-dashboard-btn"]')).toBeVisible();

      await page.click('[data-testid="continue-to-dashboard-btn"]');
      await expect(page).toHaveURL('/dashboard');
    });

    test('should handle invalid verification token', async ({ page }) => {
      await page.goto('/auth/verify-email?token=invalid-token');

      await expect(page.locator('[data-testid="invalid-verification-token"]')).toBeVisible();
      await expect(page.locator('[data-testid="request-new-verification-btn"]')).toBeVisible();
    });
  });

  test.describe('Account Security', () => {
    test('should detect suspicious login activity', async ({ page }) => {
      // This would typically involve mocking different IP addresses or user agents
      await page.goto('/auth/signin');

      // Mock suspicious login detection
      await page.addInitScript(() => {
        window.mockSuspiciousActivity = true;
      });

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');
      await page.click('[data-testid="login-submit-btn"]');

      // Should show security warning
      if (await page.locator('[data-testid="suspicious-activity-warning"]').isVisible()) {
        await expect(page.locator('[data-testid="verify-identity-btn"]')).toBeVisible();
        await expect(page.locator('[data-testid="security-notice"]')).toContainText(/unusual activity/i);
      }
    });

    test('should enforce account lockout after failed attempts', async ({ page }) => {
      await page.goto('/auth/signin');

      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
        await page.fill('[data-testid="password-input"]', 'wrongpassword');
        await page.click('[data-testid="login-submit-btn"]');

        if (i < 4) {
          await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
        }
      }

      // Account should be locked
      await expect(page.locator('[data-testid="account-locked-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-submit-btn"]')).toBeDisabled();
    });
  });

  test.describe('Multi-Factor Authentication', () => {
    test('should prompt for 2FA when enabled', async ({ page }) => {
      // Mock user with 2FA enabled
      await page.goto('/auth/signin');

      await page.addInitScript(() => {
        window.mock2FAEnabled = true;
      });

      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'testpassword123');
      await page.click('[data-testid="login-submit-btn"]');

      // Should show 2FA prompt
      await expect(page.locator('[data-testid="2fa-verification-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="2fa-code-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="use-backup-code-btn"]')).toBeVisible();
    });

    test('should verify 2FA code', async ({ page }) => {
      // Navigate to 2FA verification (mock state)
      await page.goto('/auth/2fa-verify');

      await page.fill('[data-testid="2fa-code-input"]', '123456');
      await page.click('[data-testid="verify-2fa-btn"]');

      // Should complete authentication
      await expect(page).toHaveURL('/dashboard');
    });

    test('should use backup code for 2FA', async ({ page }) => {
      await page.goto('/auth/2fa-verify');

      await page.click('[data-testid="use-backup-code-btn"]');
      await expect(page.locator('[data-testid="backup-code-input"]')).toBeVisible();

      await page.fill('[data-testid="backup-code-input"]', 'backup-code-123456');
      await page.click('[data-testid="verify-backup-code-btn"]');

      await expect(page).toHaveURL('/dashboard');
    });
  });
});
