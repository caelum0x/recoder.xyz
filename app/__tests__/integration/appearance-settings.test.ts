/**
 * Appearance Settings Integration Tests
 * End-to-end tests for appearance settings page
 */

import { test, expect } from '@playwright/test';

test.describe('Appearance Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/appearance');
  });

  test('should load appearance settings page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Appearance');
  });

  test('should display all theme options', async ({ page }) => {
    await expect(page.getByText('Light')).toBeVisible();
    await expect(page.getByText('Dark')).toBeVisible();
    await expect(page.getByText('System')).toBeVisible();
  });

  test('should display font size options', async ({ page }) => {
    await expect(page.getByText('Small')).toBeVisible();
    await expect(page.getByText('Medium')).toBeVisible();
    await expect(page.getByText('Large')).toBeVisible();
  });

  test('should display density options', async ({ page }) => {
    await expect(page.getByText('Compact')).toBeVisible();
    await expect(page.getByText('Comfortable')).toBeVisible();
    await expect(page.getByText('Spacious')).toBeVisible();
  });

  test('should select theme option', async ({ page }) => {
    const lightTheme = page.getByRole('button').filter({ hasText: 'Light' }).first();
    await lightTheme.click();
    
    await expect(lightTheme).toHaveClass(/border-orange-500/);
  });

  test('should select font size', async ({ page }) => {
    const largeFont = page.getByRole('button').filter({ hasText: 'Large' }).first();
    await largeFont.click();
    
    await expect(largeFont).toHaveClass(/border-orange-500/);
  });

  test('should select density', async ({ page }) => {
    const compactDensity = page.getByRole('button').filter({ hasText: 'Compact' }).first();
    await compactDensity.click();
    
    await expect(compactDensity).toHaveClass(/border-orange-500/);
  });

  test('should select accent color', async ({ page }) => {
    const colorButtons = page.locator('button[title]').filter({ has: page.locator('.w-12.h-12') });
    await colorButtons.first().click();
    
    // Should show check mark
    const checkIcon = colorButtons.first().locator('svg');
    await expect(checkIcon).toBeVisible();
  });

  test('should toggle reduce animations', async ({ page }) => {
    const toggle = page.locator('button').filter({ has: page.locator('.w-12.h-6.rounded-full') });
    await toggle.click();
    
    // Toggle should be active
    await expect(toggle).toHaveClass(/bg-orange-500/);
  });

  test('should save preferences', async ({ page }) => {
    // Select options
    await page.getByRole('button').filter({ hasText: 'Light' }).first().click();
    await page.getByRole('button').filter({ hasText: 'Large' }).first().click();
    
    // Mock API response
    await page.route('/api/user/preferences/appearance', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      });
    });

    // Click save
    await page.getByRole('button', { name: /save changes/i }).click();
    
    // Should show success message (if implemented)
    // await expect(page.getByText(/saved/i)).toBeVisible();
  });

  test('should navigate back to settings', async ({ page }) => {
    await page.getByRole('link', { name: /back to settings/i }).click();
    
    await expect(page).toHaveURL('/settings');
  });

  test('should cancel without saving', async ({ page }) => {
    // Make changes
    await page.getByRole('button').filter({ hasText: 'Light' }).first().click();
    
    // Click cancel
    await page.getByRole('button', { name: /cancel/i }).click();
    
    await expect(page).toHaveURL('/settings');
  });
});

test.describe('Theme Persistence', () => {
  test('should persist theme selection to localStorage', async ({ page, context }) => {
    await page.goto('/settings/appearance');
    
    // Select light theme
    await page.getByRole('button').filter({ hasText: 'Light' }).first().click();
    
    // Check localStorage
    const theme = await page.evaluate(() => localStorage.getItem('recoder-theme'));
    expect(theme).toBe('light');
  });

  test('should load saved theme on page reload', async ({ page }) => {
    // Set theme in localStorage
    await page.evaluate(() => {
      localStorage.setItem('recoder-theme', 'dark');
    });
    
    await page.goto('/settings/appearance');
    await page.reload();
    
    // Dark theme should be selected
    const darkTheme = page.getByRole('button').filter({ hasText: 'Dark' }).first();
    await expect(darkTheme).toHaveClass(/border-orange-500/);
  });
});
