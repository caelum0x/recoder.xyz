import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite 5: MCP Tools (DEPRECATED)
 * MCP button was removed as the feature is not functional
 * These tests are kept for reference but will be skipped
 */

test.describe.skip('MCP Tools Integration (Deprecated)', () => {
  
  test('MCP button should not be visible (removed)', async ({ page }) => {
    await page.goto('/');
    
    // Verify MCP button is NOT present
    const mcpButton = page.locator('button[title*="MCP"]');
    await expect(mcpButton).toHaveCount(0);
    
    console.log('✅ MCP button correctly removed from UI');
  });
});

test.describe('Verify Clean UI', () => {
  test('should only show working action buttons', async ({ page }) => {
    await page.goto('/');
    
    // Check for GitHub import button (should exist)
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await expect(githubButton).toBeVisible();
    
    // Check for MCP button (should NOT exist)
    const mcpButton = page.locator('button[title*="MCP"]');
    await expect(mcpButton).toHaveCount(0);
    
    console.log('✅ UI shows only working features');
  });
});
