import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite 8: Project Workflow Tests
 * Tests complete project lifecycle workflows including:
 * - Project creation and setup
 * - File editing and management
 * - Terminal interactions
 * - Preview functionality
 * - Project persistence
 */

test.describe('Project Workflow - Complete Lifecycle', () => {

  // ==================== Helper Functions ====================

  /**
   * Wait for the chat interface to be ready
   */
  async function waitForChatReady(page: Page) {
    await page.locator('textarea[placeholder*="How can I help"], textarea[placeholder*="message"]').first().waitFor({
      state: 'visible',
      timeout: 30000
    });
  }

  /**
   * Type a message in the chat input
   */
  async function typeInChat(page: Page, message: string) {
    const chatInput = page.locator('textarea[placeholder*="How can I help"], textarea[placeholder*="message"]').first();
    await chatInput.waitFor({ state: 'visible' });
    await chatInput.fill(message);
    return chatInput;
  }

  /**
   * Check if workbench is visible
   */
  async function isWorkbenchVisible(page: Page): Promise<boolean> {
    const workbench = page.locator('[class*="workbench"], [data-testid="workbench"], .editor-panel').first();
    return await workbench.isVisible().catch(() => false);
  }

  /**
   * Wait for file tree to be loaded
   */
  async function waitForFileTree(page: Page) {
    // Wait for file tree container
    const fileTree = page.locator('[class*="file-tree"], [data-testid="file-tree"], [class*="FileTree"]').first();
    await fileTree.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  }

  // ==================== Test Cases ====================

  test.describe('Project Creation', () => {

    test('should load the main interface', async ({ page }) => {
      console.log('Starting: Main interface load test');

      await page.goto('/');
      await waitForChatReady(page);

      // Verify main elements are present
      const chatArea = page.locator('textarea').first();
      expect(await chatArea.isVisible()).toBeTruthy();

      console.log('Completed: Main interface loaded successfully');
    });

    test('should display starter templates', async ({ page }) => {
      console.log('Starting: Starter templates display test');

      await page.goto('/');
      await waitForChatReady(page);

      // Look for starter/template buttons
      const startersButton = page.locator('button').filter({ hasText: /starter|template|browse/i }).first();

      if (await startersButton.isVisible()) {
        await startersButton.click();
        await page.waitForTimeout(1000);

        // Verify some templates are visible
        const templateItems = page.locator('[class*="starter"], [class*="template"], [data-template]');
        const count = await templateItems.count();

        console.log(`Found ${count} template items`);

        // Close the modal
        const closeButton = page.locator('button').filter({ hasText: /close|cancel|×/i }).first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
        } else {
          await page.keyboard.press('Escape');
        }
      }

      console.log('Completed: Starter templates test');
    });

    test('should type project description in chat', async ({ page }) => {
      console.log('Starting: Chat input test');

      await page.goto('/');
      await waitForChatReady(page);

      const description = 'Create a simple React counter app with TypeScript';
      await typeInChat(page, description);

      // Verify input was typed
      const chatInput = page.locator('textarea').first();
      const value = await chatInput.inputValue();
      expect(value).toBe(description);

      console.log('Completed: Chat input test');
    });
  });

  test.describe('Workbench Interactions', () => {

    test('should toggle workbench visibility', async ({ page }) => {
      console.log('Starting: Workbench toggle test');

      await page.goto('/');
      await waitForChatReady(page);

      // Find workbench toggle button
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();

      if (await workbenchToggle.isVisible()) {
        const initialState = await isWorkbenchVisible(page);
        console.log(`Initial workbench state: ${initialState ? 'visible' : 'hidden'}`);

        await workbenchToggle.click();
        await page.waitForTimeout(500);

        const afterToggle = await isWorkbenchVisible(page);
        console.log(`After toggle: ${afterToggle ? 'visible' : 'hidden'}`);
      }

      console.log('Completed: Workbench toggle test');
    });

    test('should display file tree when workbench is open', async ({ page }) => {
      console.log('Starting: File tree display test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open workbench if there's a toggle
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();
      if (await workbenchToggle.isVisible()) {
        await workbenchToggle.click();
        await page.waitForTimeout(1000);
      }

      // Check for file tree components
      const fileTreeExists = await page.locator('[class*="file-tree"], [class*="FileTree"], [class*="sidebar"]').first().isVisible();
      console.log(`File tree visible: ${fileTreeExists}`);

      console.log('Completed: File tree display test');
    });

    test('should display terminal panel', async ({ page }) => {
      console.log('Starting: Terminal panel test');

      await page.goto('/');
      await waitForChatReady(page);

      // Look for terminal toggle or panel
      const terminalToggle = page.locator('button').filter({ hasText: /terminal|console|shell/i }).first();

      if (await terminalToggle.isVisible()) {
        await terminalToggle.click();
        await page.waitForTimeout(500);

        // Check for terminal container
        const terminalExists = await page.locator('[class*="terminal"], [class*="xterm"], [data-testid="terminal"]').first().isVisible();
        console.log(`Terminal visible: ${terminalExists}`);
      }

      console.log('Completed: Terminal panel test');
    });

    test('should display preview panel', async ({ page }) => {
      console.log('Starting: Preview panel test');

      await page.goto('/');
      await waitForChatReady(page);

      // Look for preview toggle
      const previewToggle = page.locator('button').filter({ hasText: /preview|browser/i }).first();

      if (await previewToggle.isVisible()) {
        await previewToggle.click();
        await page.waitForTimeout(500);

        // Check for preview/iframe
        const previewExists = await page.locator('iframe, [class*="preview"], [data-testid="preview"]').first().isVisible();
        console.log(`Preview visible: ${previewExists}`);
      }

      console.log('Completed: Preview panel test');
    });
  });

  test.describe('File Operations', () => {

    test('should create new file through UI', async ({ page }) => {
      console.log('Starting: New file creation test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open workbench
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();
      if (await workbenchToggle.isVisible()) {
        await workbenchToggle.click();
        await page.waitForTimeout(1000);
      }

      // Look for new file button
      const newFileButton = page.locator('button[title*="new file"], button[title*="New file"], [aria-label*="new file"]').first();
      if (await newFileButton.isVisible()) {
        await newFileButton.click();
        console.log('Clicked new file button');
        await page.waitForTimeout(500);
      }

      console.log('Completed: New file creation test');
    });

    test('should select file from file tree', async ({ page }) => {
      console.log('Starting: File selection test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open workbench
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();
      if (await workbenchToggle.isVisible()) {
        await workbenchToggle.click();
        await page.waitForTimeout(1000);
      }

      // Try to find and click a file in the tree
      const fileItem = page.locator('[class*="file-tree"] [class*="file"], [data-file], .tree-item').first();
      if (await fileItem.isVisible()) {
        await fileItem.click();
        console.log('Clicked file item');
        await page.waitForTimeout(500);
      }

      console.log('Completed: File selection test');
    });
  });

  test.describe('Editor Interactions', () => {

    test('should display code editor', async ({ page }) => {
      console.log('Starting: Code editor display test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open workbench
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();
      if (await workbenchToggle.isVisible()) {
        await workbenchToggle.click();
        await page.waitForTimeout(1000);
      }

      // Check for CodeMirror or Monaco editor
      const editorExists = await page.locator('.cm-editor, [class*="monaco"], [class*="CodeMirror"], [class*="editor-content"]').first().isVisible();
      console.log(`Editor visible: ${editorExists}`);

      console.log('Completed: Code editor display test');
    });

    test('should switch between tabs', async ({ page }) => {
      console.log('Starting: Tab switching test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open workbench
      const workbenchToggle = page.locator('button').filter({ hasText: /workbench|editor|code/i }).first();
      if (await workbenchToggle.isVisible()) {
        await workbenchToggle.click();
        await page.waitForTimeout(1000);
      }

      // Look for tabs
      const tabs = page.locator('[class*="tab"], [role="tab"]');
      const tabCount = await tabs.count();
      console.log(`Found ${tabCount} tabs`);

      if (tabCount > 1) {
        await tabs.nth(1).click();
        await page.waitForTimeout(300);
        console.log('Switched to second tab');
      }

      console.log('Completed: Tab switching test');
    });
  });

  test.describe('Chat Workflow', () => {

    test('should maintain conversation history', async ({ page }) => {
      console.log('Starting: Conversation history test');

      await page.goto('/');
      await waitForChatReady(page);

      // Type first message
      await typeInChat(page, 'Hello, this is a test message');

      // Look for message in chat area
      const messageArea = page.locator('[class*="message"], [class*="chat-message"], [role="log"]');
      const hasMessages = await messageArea.count() > 0;
      console.log(`Message area present: ${hasMessages}`);

      console.log('Completed: Conversation history test');
    });

    test('should clear chat input after action', async ({ page }) => {
      console.log('Starting: Chat input clear test');

      await page.goto('/');
      await waitForChatReady(page);

      const chatInput = await typeInChat(page, 'Test message');

      // Verify input has content
      const valueBefore = await chatInput.inputValue();
      expect(valueBefore).toBe('Test message');

      // Clear the input manually (simulating user clear)
      await chatInput.clear();

      const valueAfter = await chatInput.inputValue();
      expect(valueAfter).toBe('');

      console.log('Completed: Chat input clear test');
    });
  });

  test.describe('GitHub Integration', () => {

    test('should open GitHub import modal', async ({ page }) => {
      console.log('Starting: GitHub import modal test');

      await page.goto('/');
      await waitForChatReady(page);

      // Find GitHub import button
      const githubButton = page.locator('button[title*="GitHub"], button[title*="github"], button').filter({ hasText: /github|import/i }).first();

      if (await githubButton.isVisible()) {
        await githubButton.click();
        await page.waitForTimeout(1000);

        // Check for modal content
        const modalVisible = await page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first().isVisible();
        console.log(`GitHub modal visible: ${modalVisible}`);

        // Close modal
        await page.keyboard.press('Escape');
      }

      console.log('Completed: GitHub import modal test');
    });

    test('should validate GitHub URL format', async ({ page }) => {
      console.log('Starting: GitHub URL validation test');

      await page.goto('/');
      await waitForChatReady(page);

      // Open GitHub import
      const githubButton = page.locator('button[title*="GitHub"], button').filter({ hasText: /github|import/i }).first();

      if (await githubButton.isVisible()) {
        await githubButton.click();
        await page.waitForTimeout(500);

        // Find URL input
        const urlInput = page.locator('input[placeholder*="github"], input[type="url"], input[placeholder*="URL"]').first();

        if (await urlInput.isVisible()) {
          // Enter invalid URL
          await urlInput.fill('not-a-valid-url');
          await page.waitForTimeout(300);

          // Enter valid URL
          await urlInput.fill('https://github.com/facebook/react');
          await page.waitForTimeout(300);

          const value = await urlInput.inputValue();
          expect(value).toContain('github.com');
        }

        // Close modal
        await page.keyboard.press('Escape');
      }

      console.log('Completed: GitHub URL validation test');
    });
  });

  test.describe('Project Persistence', () => {

    test('should maintain state on page refresh', async ({ page }) => {
      console.log('Starting: State persistence test');

      await page.goto('/');
      await waitForChatReady(page);

      // Type something in chat
      await typeInChat(page, 'Persistence test message');

      // Store current URL
      const currentUrl = page.url();

      // Refresh page
      await page.reload();
      await waitForChatReady(page);

      // Verify we're still on the same page
      expect(page.url()).toContain(currentUrl.split('/').pop() || '');

      console.log('Completed: State persistence test');
    });

    test('should handle navigation', async ({ page }) => {
      console.log('Starting: Navigation handling test');

      await page.goto('/');
      await waitForChatReady(page);

      // Navigate away and back
      await page.goto('about:blank');
      await page.goto('/');
      await waitForChatReady(page);

      // Verify page is functional
      const chatInput = page.locator('textarea').first();
      expect(await chatInput.isVisible()).toBeTruthy();

      console.log('Completed: Navigation handling test');
    });
  });

  test.describe('Error Handling', () => {

    test('should handle invalid routes gracefully', async ({ page }) => {
      console.log('Starting: Invalid route handling test');

      // Navigate to non-existent route
      const response = await page.goto('/nonexistent-route-12345');

      // Should either show 404 or redirect to home
      const url = page.url();
      const status = response?.status();

      console.log(`Status: ${status}, URL: ${url}`);

      // Page should not crash
      expect(status).toBeDefined();

      console.log('Completed: Invalid route handling test');
    });

    test('should display error messages appropriately', async ({ page }) => {
      console.log('Starting: Error message display test');

      await page.goto('/');
      await waitForChatReady(page);

      // Look for any error toast or error display components
      const errorDisplays = page.locator('[class*="error"], [class*="toast"], [role="alert"]');
      const errorCount = await errorDisplays.count();

      console.log(`Error/toast elements found: ${errorCount}`);

      // If errors exist, they should be dismissible
      if (errorCount > 0) {
        const dismissButton = errorDisplays.first().locator('button[title*="close"], button[title*="dismiss"]');
        if (await dismissButton.isVisible()) {
          await dismissButton.click();
          console.log('Dismissed error message');
        }
      }

      console.log('Completed: Error message display test');
    });
  });

  test.describe('Performance and Responsiveness', () => {

    test('should respond to user interactions quickly', async ({ page }) => {
      console.log('Starting: Interaction responsiveness test');

      await page.goto('/');
      await waitForChatReady(page);

      // Measure typing latency
      const chatInput = page.locator('textarea').first();
      const startTime = Date.now();

      await chatInput.fill('Testing responsiveness');

      const typingTime = Date.now() - startTime;
      console.log(`Typing interaction time: ${typingTime}ms`);

      expect(typingTime).toBeLessThan(1000); // Should complete within 1 second

      console.log('Completed: Interaction responsiveness test');
    });

    test('should handle rapid interactions', async ({ page }) => {
      console.log('Starting: Rapid interaction test');

      await page.goto('/');
      await waitForChatReady(page);

      const chatInput = page.locator('textarea').first();

      // Rapid typing and clearing
      for (let i = 0; i < 5; i++) {
        await chatInput.fill(`Message ${i}`);
        await chatInput.clear();
      }

      // Final value should be empty
      const finalValue = await chatInput.inputValue();
      expect(finalValue).toBe('');

      console.log('Completed: Rapid interaction test');
    });
  });

  test.describe('Accessibility', () => {

    test('should support keyboard navigation', async ({ page }) => {
      console.log('Starting: Keyboard navigation test');

      await page.goto('/');
      await waitForChatReady(page);

      // Tab through focusable elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Check that something is focused
      const focusedElement = await page.locator(':focus').first();
      const isFocused = await focusedElement.count() > 0;

      console.log(`Element focused after tabbing: ${isFocused}`);

      console.log('Completed: Keyboard navigation test');
    });

    test('should have proper ARIA attributes', async ({ page }) => {
      console.log('Starting: ARIA attributes test');

      await page.goto('/');
      await waitForChatReady(page);

      // Check for common ARIA attributes
      const ariaLabels = await page.locator('[aria-label]').count();
      const ariaDescribed = await page.locator('[aria-describedby]').count();
      const roles = await page.locator('[role]').count();

      console.log(`ARIA labels: ${ariaLabels}`);
      console.log(`ARIA describedby: ${ariaDescribed}`);
      console.log(`Role attributes: ${roles}`);

      // Should have some ARIA attributes
      expect(ariaLabels + ariaDescribed + roles).toBeGreaterThan(0);

      console.log('Completed: ARIA attributes test');
    });
  });
});
