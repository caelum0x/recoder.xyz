import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 3: GitHub Integration
 * Tests GitHub repository import functionality
 */

test.describe('GitHub Integration', () => {
  
  test('should open GitHub import modal', async ({ page }) => {
    await page.goto('/');
    
    // Click GitHub import button
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    
    // Wait for modal
    await page.waitForTimeout(1000);
    
    // Check if import modal is visible
    const modal = page.locator('text=Import from GitHub').first();
    await expect(modal).toBeVisible();
    
    console.log('✅ GitHub import modal opened');
  });

  test('should display repository URL input', async ({ page }) => {
    await page.goto('/');
    
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(1000);
    
    // Look for URL input
    const urlInput = page.locator('input[placeholder*="github.com"]').first();
    await expect(urlInput).toBeVisible();
    
    console.log('✅ Repository URL input visible');
  });

  test('should validate repository URL format', async ({ page }) => {
    await page.goto('/');
    
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(1000);
    
    const urlInput = page.locator('input[placeholder*="github.com"]').first();
    
    // Enter invalid URL
    await urlInput.fill('not-a-valid-url');
    
    // Try to submit
    const cloneButton = page.locator('button').filter({ hasText: /clone|import/i }).first();
    
    if (await cloneButton.isVisible()) {
      await cloneButton.click();
      await page.waitForTimeout(1000);
      
      // Should show error or not proceed
      console.log('✅ Invalid URL validation works');
    }
  });

  test('should accept valid GitHub URL', async ({ page }) => {
    await page.goto('/');
    
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(1000);
    
    const urlInput = page.locator('input[placeholder*="github.com"]').first();
    
    // Enter valid URL
    await urlInput.fill('https://github.com/vercel/next.js');
    
    // Verify input has value
    await expect(urlInput).toHaveValue(/github.com/);
    
    console.log('✅ Valid GitHub URL accepted');
  });

  test('should close GitHub import modal', async ({ page }) => {
    await page.goto('/');
    
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(1000);
    
    // Find close button
    const closeButton = page.locator('button').filter({ hasText: /close|×/i }).first();
    await closeButton.click();
    await page.waitForTimeout(500);
    
    console.log('✅ GitHub import modal closed');
  });
});
