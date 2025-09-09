import { test, expect, Page } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the home page
    await page.goto('/');
  });

  test('should display registration page correctly', async ({ page }) => {
    // Navigate to registration page
    await page.click('[data-testid="sign-up-button"]');
    
    // Verify we're on the registration page
    await expect(page).toHaveURL(/.*\/auth\/register/);
    await expect(page.locator('h1')).toContainText(/sign up|register|create account/i);
    
    // Check form fields are present
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-button"]')).toBeVisible();
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Try to register with empty fields
    await page.click('[data-testid="register-button"]');
    
    // Check for validation messages
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Fill invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.fill('[data-testid="password-input"]', 'ValidPassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    await page.click('[data-testid="register-button"]');
    
    // Check for email validation error
    await expect(page.locator('[data-testid="email-error"]')).toContainText(/invalid email/i);
  });

  test('should show error for weak password', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Fill weak password
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', '123');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    await page.click('[data-testid="register-button"]');
    
    // Check for password validation error
    await expect(page.locator('[data-testid="password-error"]')).toContainText(/password/i);
  });

  test('should successfully register a new user', async ({ page }) => {
    await page.goto('/auth/register');
    
    const timestamp = Date.now();
    const testEmail = `test.user.${timestamp}@example.com`;
    
    // Fill valid registration form
    await page.fill('[data-testid="email-input"]', testEmail);
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    // Submit registration
    await page.click('[data-testid="register-button"]');
    
    // Should redirect to dashboard or verification page
    await page.waitForURL(url => 
      url.pathname.includes('/dashboard') || 
      url.pathname.includes('/verify') ||
      url.pathname.includes('/welcome')
    );
    
    // Verify successful registration
    if (page.url().includes('/dashboard')) {
      await expect(page.locator('[data-testid="user-name"]')).toContainText('Test User');
    } else if (page.url().includes('/verify')) {
      await expect(page.locator('h1')).toContainText(/verify/i);
    }
  });

  test('should show error for duplicate email registration', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Try to register with existing email
    await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    await page.click('[data-testid="register-button"]');
    
    // Should show error for existing user
    await expect(page.locator('[data-testid="registration-error"]')).toContainText(/already exists|already registered/i);
  });

  test('should allow navigation to login page', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Click login link
    await page.click('[data-testid="login-link"]');
    
    // Should navigate to login page
    await expect(page).toHaveURL(/.*\/auth\/login/);
    await expect(page.locator('h1')).toContainText(/sign in|log in/i);
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Check form has proper labels and accessibility attributes
    const emailInput = page.locator('[data-testid="email-input"]');
    const passwordInput = page.locator('[data-testid="password-input"]');
    const nameInput = page.locator('[data-testid="name-input"]');
    
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(nameInput).toHaveAttribute('type', 'text');
    
    // Check for ARIA labels or associated labels
    await expect(emailInput).toHaveAttribute('aria-label');
    await expect(passwordInput).toHaveAttribute('aria-label');
    await expect(nameInput).toHaveAttribute('aria-label');
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Tab through form fields
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="email-input"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="password-input"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="name-input"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="register-button"]')).toBeFocused();
  });

  test('should show loading state during registration', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Intercept the registration API call to make it slow
    await page.route('**/api/auth/register', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });
    
    // Fill form and submit
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    await page.click('[data-testid="register-button"]');
    
    // Check loading state
    await expect(page.locator('[data-testid="register-button"]')).toBeDisabled();
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
  });
});
