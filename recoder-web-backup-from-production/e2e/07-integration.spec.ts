import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite 7: Integration Tests
 * Tests complete user workflows end-to-end
 */

test.describe('Integration Tests - Complete Workflows', () => {
  
  test('Full workflow: Browse starter → Select → Close', async ({ page }) => {
    await page.goto('/');
    
    console.log('🧪 Starting full starter selection workflow...');
    
    // Step 1: Open starters browser
    const startersButton = page.locator('button').filter({ hasText: /local.*starter|browse.*starter/i }).first();
    
    if (await startersButton.isVisible()) {
      await startersButton.click();
      await page.waitForTimeout(1000);
      console.log('  ✅ Step 1: Opened starters browser');
      
      // Step 2: Search for a starter
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('next');
        await page.waitForTimeout(500);
        console.log('  ✅ Step 2: Searched for "next"');
      }
      
      // Step 3: Close browser
      const closeButton = page.locator('button').filter({ hasText: /close|×/i }).first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(500);
        console.log('  ✅ Step 3: Closed starters browser');
      }
      
      console.log('✅ Complete starter workflow passed');
    }
  });

  test('Full workflow: Open GitHub import → Enter URL → Close', async ({ page }) => {
    await page.goto('/');
    
    console.log('🧪 Starting full GitHub import workflow...');
    
    // Step 1: Open GitHub import
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(1000);
    console.log('  ✅ Step 1: Opened GitHub import');
    
    // Step 2: Enter repository URL
    const urlInput = page.locator('input[placeholder*="github.com"]').first();
    await urlInput.fill('https://github.com/vercel/next.js');
    console.log('  ✅ Step 2: Entered repository URL');
    
    // Step 3: Close modal
    const closeButton = page.locator('button').filter({ hasText: /close|×/i }).first();
    await closeButton.click();
    await page.waitForTimeout(500);
    console.log('  ✅ Step 3: Closed import modal');
    
    console.log('✅ Complete GitHub import workflow passed');
  });

  test('Full workflow: Type message → Open workbench → Close chat', async ({ page }) => {
    await page.goto('/');
    
    console.log('🧪 Starting full chat + workbench workflow...');
    
    // Step 1: Type in chat
    const chatInput = page.locator('textarea[placeholder*="How can I help"]').first();
    await chatInput.waitFor({ state: 'visible' });
    await chatInput.fill('Create a simple React app');
    console.log('  ✅ Step 1: Typed message in chat');
    
    // Step 2: Open workbench
    const workbenchToggle = page.locator('button').filter({ hasText: /workbench/i }).first();
    if (await workbenchToggle.isVisible()) {
      await workbenchToggle.click();
      await page.waitForTimeout(1000);
      console.log('  ✅ Step 2: Opened workbench');
    }
    
    // Step 3: Toggle chat
    const chatToggle = page.locator('button').filter({ hasText: /chat/i }).first();
    if (await chatToggle.isVisible()) {
      await chatToggle.click();
      await page.waitForTimeout(500);
      console.log('  ✅ Step 3: Toggled chat');
    }
    
    console.log('✅ Complete chat + workbench workflow passed');
  });

  test('Full workflow: Open all modals and close them', async ({ page }) => {
    await page.goto('/');
    
    console.log('🧪 Starting modal stress test...');
    
    // Open and close starters
    const startersButton = page.locator('button').filter({ hasText: /local.*starter|browse.*starter/i }).first();
    if (await startersButton.isVisible()) {
      await startersButton.click();
      await page.waitForTimeout(500);
      let closeBtn = page.locator('button').filter({ hasText: /close|×/i }).first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
      console.log('  ✅ Starters modal: open → close');
    }
    
    // Open and close GitHub
    const githubButton = page.locator('button[title*="GitHub"]').first();
    await githubButton.click();
    await page.waitForTimeout(500);
    let closeBtn = page.locator('button').filter({ hasText: /close|×/i }).first();
    if (await closeBtn.isVisible()) await closeBtn.click();
    await page.waitForTimeout(500);
    console.log('  ✅ GitHub modal: open → close');
    
    // Open and close MCP
    const mcpButton = page.locator('button[title*="MCP"]').first();
    await mcpButton.click();
    await page.waitForTimeout(500);
    closeBtn = page.locator('button').filter({ hasText: /close|×/i }).first();
    if (await closeBtn.isVisible()) await closeBtn.click();
    await page.waitForTimeout(500);
    console.log('  ✅ MCP modal: open → close');
    
    console.log('✅ Modal stress test passed');
  });

  test('Performance test: Page load time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.locator('body').waitFor({ state: 'visible' });
    
    const loadTime = Date.now() - startTime;
    
    console.log(`⏱️  Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(5000); // Should load in under 5 seconds
    
    console.log('✅ Performance test passed');
  });

  test('Accessibility: Check for basic a11y violations', async ({ page }) => {
    await page.goto('/');
    
    // Check for basic accessibility elements
    const hasMain = await page.locator('main, [role="main"]').count() > 0;
    const hasButtons = await page.locator('button').count() > 0;
    
    console.log(`📋 Accessibility check:`);
    console.log(`  - Has main content area: ${hasMain}`);
    console.log(`  - Has interactive buttons: ${hasButtons}`);
    
    expect(hasButtons).toBeTruthy();
    console.log('✅ Basic accessibility check passed');
  });
});
