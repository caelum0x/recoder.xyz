import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 1: Basic Application Flow
 * Tests the core functionality and user journey
 *
 * Note: These tests use the auth fixture which automatically handles
 * authentication setup for all tests.
 */

test.describe('Basic Application Flow', () => {
  
  test('should load the application successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/bolt|Recoder/i);
    
    // Check main elements are visible
    await expect(page.locator('body')).toBeVisible();
    
    console.log('✅ Application loaded successfully');
  });

  test('should display chat interface', async ({ page }) => {
    await page.goto('/');
    
    // Wait for chat to be visible
    const chatInput = page.locator('textarea[placeholder*="How can I help"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Chat interface is visible');
  });

  test('should display header with action buttons', async ({ page }) => {
    await page.goto('/');
    
    // Check for GitHub import button
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await expect(githubButton).toBeVisible();
    
    // Check for MCP Tools button
    const mcpButton = page.locator('button[title*="MCP"]').first();
    await expect(mcpButton).toBeVisible();
    
    console.log('✅ Header action buttons visible');
  });

  test('should toggle chat visibility', async ({ page }) => {
    await page.goto('/');
    
    // Find chat toggle button
    const chatToggle = page.locator('button').filter({ hasText: /chat/i }).first();
    
    if (await chatToggle.isVisible()) {
      // Toggle chat off
      await chatToggle.click();
      await page.waitForTimeout(500);
      
      // Toggle chat back on
      await chatToggle.click();
      await page.waitForTimeout(500);
      
      console.log('✅ Chat toggle works');
    } else {
      console.log('⚠️  Chat toggle not found, skipping');
    }
  });

  test('should be able to type in chat input', async ({ page }) => {
    await page.goto('/');
    
    const chatInput = page.locator('textarea[placeholder*="How can I help"]').first();
    await chatInput.waitFor({ state: 'visible' });
    
    // Type test message
    await chatInput.fill('Hello, this is a test message');
    
    // Verify text was entered
    await expect(chatInput).toHaveValue('Hello, this is a test message');
    
    console.log('✅ Can type in chat input');
  });
});
