import { test, expect } from '@playwright/test';

test.describe('Billing - Checkout', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/auth/signin');
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL || 'test@recoder.xyz');
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD || 'Test123!@#');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('should display pricing plans', async ({ page }) => {
    await page.goto('/pricing');
    
    // Check for plan cards
    await expect(page.locator('text=/free.*plan/i')).toBeVisible();
    await expect(page.locator('text=/pro.*plan/i')).toBeVisible();
    await expect(page.locator('text=/enterprise.*plan/i')).toBeVisible();
  });

  test('should navigate to checkout', async ({ page }) => {
    await page.goto('/pricing');
    
    // Click on a plan button
    await page.locator('button:has-text("Subscribe")').first().click();
    
    // Should navigate to checkout
    await expect(page).toHaveURL(/.*checkout/);
  });

  test('should display checkout form', async ({ page }) => {
    await page.goto('/checkout?plan=pro');
    
    // Check for checkout elements
    await expect(page.locator('text=/checkout/i')).toBeVisible();
    await expect(page.locator('text=/payment.*details/i')).toBeVisible();
  });

  test('should show plan details in checkout', async ({ page }) => {
    await page.goto('/checkout?plan=pro');
    
    // Should display selected plan
    await expect(page.locator('text=/pro.*plan/i')).toBeVisible();
    await expect(page.locator('text=/\\$.*month/i')).toBeVisible();
  });
});
