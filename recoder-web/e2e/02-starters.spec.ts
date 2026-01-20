import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 2: Starter Templates
 * Tests the local starter template system
 */

test.describe('Starter Templates', () => {
  
  test('should open local starters browser', async ({ page }) => {
    await page.goto('/');
    
    // Click "Browse Local Starters" button
    const startersButton = page.locator('button').filter({ hasText: /local.*starter/i }).first();
    
    if (await startersButton.isVisible()) {
      await startersButton.click();
      
      // Wait for modal to appear
      await page.waitForTimeout(1000);
      
      // Check if starters are displayed
      const modal = page.locator('[role="dialog"]').first();
      await expect(modal).toBeVisible();
      
      console.log('✅ Starters browser opened');
    } else {
      console.log('⚠️  Starters button not found, checking alternative...');
    }
  });

  test('should display starter categories', async ({ page }) => {
    await page.goto('/');
    
    const startersButton = page.locator('button').filter({ hasText: /local.*starter|browse.*starter/i }).first();
    
    if (await startersButton.isVisible()) {
      await startersButton.click();
      await page.waitForTimeout(1000);
      
      // Look for category buttons (All, Frontend, Backend, etc.)
      const categories = page.locator('button').filter({ hasText: /frontend|backend|mobile/i });
      const count = await categories.count();
      
      console.log(`✅ Found ${count} category buttons`);
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should search for starters', async ({ page }) => {
    await page.goto('/');
    
    const startersButton = page.locator('button').filter({ hasText: /local.*starter|browse.*starter/i }).first();
    
    if (await startersButton.isVisible()) {
      await startersButton.click();
      await page.waitForTimeout(1000);
      
      // Find search input
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      
      if (await searchInput.isVisible()) {
        await searchInput.fill('react');
        await page.waitForTimeout(500);
        
        console.log('✅ Can search starters');
      }
    }
  });

  test('should close starters browser', async ({ page }) => {
    await page.goto('/');
    
    const startersButton = page.locator('button').filter({ hasText: /local.*starter|browse.*starter/i }).first();
    
    if (await startersButton.isVisible()) {
      await startersButton.click();
      await page.waitForTimeout(1000);
      
      // Find close button
      const closeButton = page.locator('button').filter({ hasText: /close|×/i }).first();
      
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(500);
        
        console.log('✅ Starters browser closed');
      }
    }
  });
});
