import { test, expect } from '@playwright/test';

test.describe('Dashboard - Overview', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL || 'test@recoder.xyz');
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD || 'Test123!@#');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 15000 });
  });

  test('should display dashboard overview', async ({ page }) => {
    // Check for dashboard elements
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    
    // Check for metric cards
    await expect(page.locator('text=/total.*usage/i')).toBeVisible();
    await expect(page.locator('text=/active.*projects/i')).toBeVisible();
  });

  test('should navigate to usage analytics', async ({ page }) => {
    await page.locator('text=/usage.*analytics/i').first().click();
    await expect(page).toHaveURL(/.*usage/);
  });

  test('should navigate to projects', async ({ page }) => {
    await page.locator('text=/projects/i').first().click();
    await expect(page).toHaveURL(/.*projects/);
  });

  test('should navigate to settings', async ({ page }) => {
    await page.locator('text=/settings/i').first().click();
    await expect(page).toHaveURL(/.*settings/);
  });

  test('should display user menu', async ({ page }) => {
    // Click on user avatar/menu
    await page.locator('[data-testid="user-menu"]').click();
    
    // Check for menu items
    await expect(page.locator('text=/profile/i')).toBeVisible();
    await expect(page.locator('text=/sign.*out/i')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Open user menu
    await page.locator('[data-testid="user-menu"]').click();
    
    // Click logout
    await page.locator('text=/sign.*out/i').click();
    
    // Should redirect to login
    await page.waitForURL('**/signin', { timeout: 10000 });
    await expect(page).toHaveURL(/.*signin/);
  });
});
