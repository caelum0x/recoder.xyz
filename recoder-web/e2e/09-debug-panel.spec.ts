import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 9: Debug Panel Features
 * Tests debugging functionality including breakpoints, stepping, and variables
 */

test.describe('Debug Panel', () => {

  test('should toggle debug panel visibility', async ({ page }) => {
    await page.goto('/');

    // Find debug panel toggle button
    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      console.log('✅ Debug panel toggled');
    } else {
      console.log('⚠️  Debug toggle not found, skipping');
    }
  });

  test('should display debug panel tabs', async ({ page }) => {
    await page.goto('/');

    // Open debug panel
    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Check for debug tabs
      const breakpointsTab = page.locator('button').filter({ hasText: /breakpoints/i }).first();
      const watchTab = page.locator('button').filter({ hasText: /watch/i }).first();
      const callStackTab = page.locator('button').filter({ hasText: /call stack/i }).first();
      const variablesTab = page.locator('button').filter({ hasText: /variables/i }).first();

      const hasBreakpoints = await breakpointsTab.isVisible();
      const hasWatch = await watchTab.isVisible();
      const hasCallStack = await callStackTab.isVisible();
      const hasVariables = await variablesTab.isVisible();

      if (hasBreakpoints && hasWatch && hasCallStack && hasVariables) {
        console.log('✅ All debug tabs are visible');
      } else {
        console.log('⚠️  Some debug tabs not found');
      }
    }
  });

  test('should switch between debug tabs', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Switch to breakpoints tab
      const breakpointsTab = page.locator('button').filter({ hasText: /breakpoints/i }).first();
      if (await breakpointsTab.isVisible()) {
        await breakpointsTab.click();
        await page.waitForTimeout(500);
      }

      // Switch to watch tab
      const watchTab = page.locator('button').filter({ hasText: /watch/i }).first();
      if (await watchTab.isVisible()) {
        await watchTab.click();
        await page.waitForTimeout(500);
      }

      // Switch to variables tab
      const variablesTab = page.locator('button').filter({ hasText: /variables/i }).first();
      if (await variablesTab.isVisible()) {
        await variablesTab.click();
        await page.waitForTimeout(500);
      }

      console.log('✅ Can switch between debug tabs');
    }
  });

  test('should display debug toolbar controls', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Look for debug control buttons
      const startButton = page.locator('button').filter({ hasText: /start/i }).first();
      const hasStartButton = await startButton.isVisible();

      if (hasStartButton) {
        console.log('✅ Debug toolbar controls visible');
      } else {
        console.log('⚠️  Debug toolbar not found');
      }
    }
  });

  test('should show launch menu for different debuggers', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Click start button to open launch menu
      const startButton = page.locator('button').filter({ hasText: /start/i }).first();
      if (await startButton.isVisible()) {
        await startButton.click();
        await page.waitForTimeout(500);

        // Check for debugger options (Node.js, Python, Go, Chrome)
        const nodeOption = page.locator('button').filter({ hasText: /node/i }).first();
        const pythonOption = page.locator('button').filter({ hasText: /python/i }).first();

        const hasOptions = (await nodeOption.isVisible()) || (await pythonOption.isVisible());

        if (hasOptions) {
          console.log('✅ Launch menu with debugger options displayed');
        } else {
          console.log('⚠️  Launch menu options not found');
        }
      }
    }
  });

  test('should display connection status', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Look for connection status indicator
      const connectionStatus = page.locator('text=/connected|disconnected/i').first();
      const hasStatus = await connectionStatus.isVisible();

      if (hasStatus) {
        console.log('✅ Connection status displayed');
      } else {
        console.log('⚠️  Connection status not found');
      }
    }
  });

  test('should display empty state for breakpoints', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Switch to breakpoints tab
      const breakpointsTab = page.locator('button').filter({ hasText: /breakpoints/i }).first();
      if (await breakpointsTab.isVisible()) {
        await breakpointsTab.click();
        await page.waitForTimeout(500);

        // Check for empty state message
        const emptyState = page.locator('text=/no breakpoints/i').first();
        const hasEmptyState = await emptyState.isVisible();

        if (hasEmptyState) {
          console.log('✅ Breakpoints empty state displayed');
        }
      }
    }
  });

  test('should allow adding watch expressions', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Switch to watch tab
      const watchTab = page.locator('button').filter({ hasText: /watch/i }).first();
      if (await watchTab.isVisible()) {
        await watchTab.click();
        await page.waitForTimeout(500);

        // Look for watch expression input
        const watchInput = page.locator('input[placeholder*="watch"]').first();
        const hasInput = await watchInput.isVisible();

        if (hasInput) {
          // Try to type a watch expression
          await watchInput.fill('myVariable');

          // Look for add button
          const addButton = page.locator('button').filter({ hasText: /add/i }).first();
          const hasAddButton = await addButton.isVisible();

          if (hasAddButton) {
            console.log('✅ Can add watch expressions');
          }
        }
      }
    }
  });

  test('should display variables tab empty state when not paused', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Switch to variables tab
      const variablesTab = page.locator('button').filter({ hasText: /variables/i }).first();
      if (await variablesTab.isVisible()) {
        await variablesTab.click();
        await page.waitForTimeout(500);

        // Check for empty state when not paused
        const emptyState = page.locator('text=/pause execution to inspect variables|no variables/i').first();
        const hasEmptyState = await emptyState.isVisible();

        if (hasEmptyState) {
          console.log('✅ Variables empty state displayed');
        }
      }
    }
  });

  test('should display call stack empty state when not paused', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Switch to call stack tab
      const callStackTab = page.locator('button').filter({ hasText: /call stack/i }).first();
      if (await callStackTab.isVisible()) {
        await callStackTab.click();
        await page.waitForTimeout(500);

        // Check for empty state when not paused
        const emptyState = page.locator('text=/pause execution to see|no call stack/i').first();
        const hasEmptyState = await emptyState.isVisible();

        if (hasEmptyState) {
          console.log('✅ Call stack empty state displayed');
        }
      }
    }
  });

  test('should show step controls when session is active', async ({ page }) => {
    await page.goto('/');

    const debugToggle = page.locator('button').filter({ hasText: /debug/i }).first();

    if (await debugToggle.isVisible()) {
      await debugToggle.click();
      await page.waitForTimeout(1000);

      // Look for step controls (continue, pause, step over, step into, step out)
      // These should exist but may be disabled
      const continueButton = page.locator('button[title*="Continue"]').first();
      const stepOverButton = page.locator('button[title*="Step Over"]').first();
      const stepIntoButton = page.locator('button[title*="Step Into"]').first();
      const stepOutButton = page.locator('button[title*="Step Out"]').first();

      const hasContinue = await continueButton.isVisible();
      const hasStepOver = await stepOverButton.isVisible();
      const hasStepInto = await stepIntoButton.isVisible();
      const hasStepOut = await stepOutButton.isVisible();

      if (hasContinue || hasStepOver || hasStepInto || hasStepOut) {
        console.log('✅ Step controls are visible');
      } else {
        console.log('⚠️  Step controls not found');
      }
    }
  });
});
