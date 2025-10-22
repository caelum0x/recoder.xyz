import { test, expect } from '@playwright/test';

test.describe('Authentication - Signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signup');
  });

  test('should display signup form', async ({ page }) => {
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should validate password requirements', async ({ page }) => {
    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('weak');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show password requirement error
    await expect(page.locator('text=/password.*8.*characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('should validate email format', async ({ page }) => {
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.locator('input[type="email"]').blur();
    
    // Should show email validation error
    await expect(page.locator('text=/valid.*email/i')).toBeVisible({ timeout: 5000 });
  });

  test('should create account successfully', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `test+${timestamp}@recoder.xyz`;
    
    await page.locator('input[name="name"]').fill('E2E Test User');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill('Test123!@#');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show success message or redirect
    await page.waitForURL('**/verify-email', { timeout: 15000 });
    await expect(page).toHaveURL(/.*verify-email/);
  });

  test('should show error for existing email', async ({ page }) => {
    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[type="email"]').fill('existing@recoder.xyz');
    await page.locator('input[type="password"]').fill('Test123!@#');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show error
    await expect(page.locator('text=/email.*already.*exists/i')).toBeVisible({ timeout: 10000 });
  });
});
