import { Page, expect } from '@playwright/test';

export class LoginHelper {
  constructor(private page: Page) {}

  async ensureLoggedIn(): Promise<void> {
    // Check if user is already logged in
    const isLoggedIn = await this.page.locator('[data-testid="user-menu"]').isVisible();
    
    if (!isLoggedIn) {
      await this.loginWithTestUser();
    }
  }

  async loginWithTestUser(): Promise<void> {
    // Navigate to login page
    await this.page.goto('/auth/signin');
    
    // Wait for login form to be visible
    await expect(this.page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // Use test credentials from environment or default test user
    const testEmail = process.env.TEST_USER_EMAIL || 'test@recoder.xyz';
    const testPassword = process.env.TEST_USER_PASSWORD || 'testpassword123';
    
    // Fill login form
    await this.page.fill('[data-testid="email-input"]', testEmail);
    await this.page.fill('[data-testid="password-input"]', testPassword);
    
    // Submit login form
    await this.page.click('[data-testid="login-submit-btn"]');
    
    // Wait for successful login (redirect to dashboard)
    await this.page.waitForURL('**/dashboard');
    
    // Verify user is logged in
    await expect(this.page.locator('[data-testid="user-menu"]')).toBeVisible();
  }

  async loginWithCredentials(email: string, password: string): Promise<void> {
    await this.page.goto('/auth/signin');
    
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-submit-btn"]');
    
    // Wait for login to complete
    await this.page.waitForLoadState('networkidle');
  }

  async logout(): Promise<void> {
    // Click user menu
    await this.page.click('[data-testid="user-menu"]');
    
    // Click logout button
    await this.page.click('[data-testid="logout-btn"]');
    
    // Wait for redirect to login page
    await this.page.waitForURL('**/auth/signin');
    
    // Verify user is logged out
    await expect(this.page.locator('[data-testid="login-form"]')).toBeVisible();
  }

  async registerNewUser(userData: {
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    await this.page.goto('/auth/signup');
    
    // Fill registration form
    await this.page.fill('[data-testid="name-input"]', userData.name);
    await this.page.fill('[data-testid="email-input"]', userData.email);
    await this.page.fill('[data-testid="password-input"]', userData.password);
    await this.page.fill('[data-testid="confirm-password-input"]', userData.password);
    
    // Accept terms and conditions
    await this.page.check('[data-testid="accept-terms-checkbox"]');
    
    // Submit registration
    await this.page.click('[data-testid="register-submit-btn"]');
    
    // Wait for success message or redirect
    try {
      // Check for email verification requirement
      await expect(this.page.locator('[data-testid="email-verification-message"]')).toBeVisible({ timeout: 5000 });
    } catch {
      // Or check for direct login (if email verification is disabled)
      await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    }
  }

  async resetPassword(email: string): Promise<void> {
    await this.page.goto('/auth/forgot-password');
    
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.click('[data-testid="reset-password-btn"]');
    
    // Wait for success message
    await expect(this.page.locator('[data-testid="reset-email-sent-message"]')).toBeVisible();
  }

  async verifyEmailVerificationFlow(): Promise<void> {
    // This would typically require email automation or mock email service
    // For now, we'll verify the UI elements are present
    await expect(this.page.locator('[data-testid="email-verification-message"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="resend-verification-btn"]')).toBeVisible();
  }

  async resendVerificationEmail(): Promise<void> {
    await this.page.click('[data-testid="resend-verification-btn"]');
    await expect(this.page.locator('[data-testid="verification-resent-message"]')).toBeVisible();
  }

  async switchAccount(): Promise<void> {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('[data-testid="switch-account-btn"]');
    await expect(this.page.locator('[data-testid="account-switcher"]')).toBeVisible();
  }

  async checkSessionPersistence(): Promise<void> {
    // Refresh the page and verify user remains logged in
    await this.page.reload();
    await expect(this.page.locator('[data-testid="user-menu"]')).toBeVisible();
  }

  async loginWithOAuth(provider: 'github' | 'google' | 'discord'): Promise<void> {
    await this.page.goto('/auth/signin');
    
    // Click OAuth provider button
    await this.page.click(`[data-testid="oauth-${provider}-btn"]`);
    
    // Handle OAuth popup (this would need special configuration in real tests)
    // For now, we'll just verify the OAuth flow is initiated
    await this.page.waitForURL(`**/${provider}**`, { timeout: 10000 });
    
    // In a real implementation, you would handle the OAuth provider's login flow
    // and then verify the user is redirected back and logged in
  }

  async verifyLoginValidation(): Promise<void> {
    await this.page.goto('/auth/signin');
    
    // Test empty form submission
    await this.page.click('[data-testid="login-submit-btn"]');
    await expect(this.page.locator('[data-testid="email-error"]')).toContainText(/required/i);
    await expect(this.page.locator('[data-testid="password-error"]')).toContainText(/required/i);
    
    // Test invalid email format
    await this.page.fill('[data-testid="email-input"]', 'invalid-email');
    await this.page.click('[data-testid="login-submit-btn"]');
    await expect(this.page.locator('[data-testid="email-error"]')).toContainText(/invalid email/i);
    
    // Test invalid credentials
    await this.page.fill('[data-testid="email-input"]', 'nonexistent@example.com');
    await this.page.fill('[data-testid="password-input"]', 'wrongpassword');
    await this.page.click('[data-testid="login-submit-btn"]');
    await expect(this.page.locator('[data-testid="login-error"]')).toContainText(/invalid credentials/i);
  }
}
