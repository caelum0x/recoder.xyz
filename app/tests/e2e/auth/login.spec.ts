import { test, expect } from '@playwright/test';

test.describe('Authentication - Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin');
  });

  test('should display login form', async ({ page }) => {
    // Check for form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    // Click submit without filling form
    await page.locator('button[type="submit"]').click();
    
    // Should show validation errors
    await expect(page.locator('text=/email.*required/i')).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials
    await page.locator('input[type="email"]').fill('invalid@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Should show error message
    await expect(page.locator('text=/invalid.*credentials/i')).toBeVisible({ timeout: 10000 });
  });

  test('should login with valid credentials', async ({ page }) => {
    // Fill in valid test credentials
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL || 'test@recoder.xyz');
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD || 'Test123!@#');
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Should redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should navigate to signup page', async ({ page }) => {
    await page.locator('text=/sign up/i').click();
    await expect(page).toHaveURL(/.*signup/);
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.locator('text=/forgot.*password/i').click();
    await expect(page).toHaveURL(/.*forgot-password/);
  });

  test('should show OAuth providers', async ({ page }) => {
    // Check for OAuth buttons
    await expect(page.locator('button:has-text("Google")')).toBeVisible();
    await expect(page.locator('button:has-text("GitHub")')).toBeVisible();
  });
});
