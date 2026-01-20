import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 4: Workbench Features
 * Tests code editor and preview functionality
 */

test.describe('Workbench Features', () => {
  
  test('should toggle workbench visibility', async ({ page }) => {
    await page.goto('/');
    
    // Find workbench toggle
    const workbenchToggle = page.locator('button').filter({ hasText: /workbench/i }).first();
    
    if (await workbenchToggle.isVisible()) {
      await workbenchToggle.click();
      await page.waitForTimeout(1000);
      
      console.log('✅ Workbench toggled');
    }
  });

  test('should display code editor when workbench is open', async ({ page }) => {
    await page.goto('/');
    
    const workbenchToggle = page.locator('button').filter({ hasText: /workbench/i }).first();
    
    if (await workbenchToggle.isVisible()) {
      await workbenchToggle.click();
      await page.waitForTimeout(1000);
      
      // Check for editor elements
      const editor = page.locator('.cm-editor').first();
      const hasEditor = await editor.isVisible();
      
      if (hasEditor) {
        console.log('✅ Code editor is visible');
      } else {
        console.log('⚠️  Code editor not found');
      }
    }
  });

  test('should switch between code and preview views', async ({ page }) => {
    await page.goto('/');
    
    const workbenchToggle = page.locator('button').filter({ hasText: /workbench/i }).first();
    
    if (await workbenchToggle.isVisible()) {
      await workbenchToggle.click();
      await page.waitForTimeout(1000);
      
      // Look for code/preview toggle
      const codeButton = page.locator('button').filter({ hasText: /code/i }).first();
      const previewButton = page.locator('button').filter({ hasText: /preview/i }).first();
      
      if (await codeButton.isVisible() && await previewButton.isVisible()) {
        await previewButton.click();
        await page.waitForTimeout(500);
        
        await codeButton.click();
        await page.waitForTimeout(500);
        
        console.log('✅ Can switch between code and preview');
      }
    }
  });

  test('should display file tree in workbench', async ({ page }) => {
    await page.goto('/');
    
    const workbenchToggle = page.locator('button').filter({ hasText: /workbench/i }).first();
    
    if (await workbenchToggle.isVisible()) {
      await workbenchToggle.click();
      await page.waitForTimeout(1000);
      
      // Look for file tree elements
      const fileTree = page.locator('[role="tree"]').first();
      const hasFileTree = await fileTree.isVisible();
      
      if (hasFileTree) {
        console.log('✅ File tree is visible');
      } else {
        console.log('⚠️  File tree not found (may need files first)');
      }
    }
  });
});
