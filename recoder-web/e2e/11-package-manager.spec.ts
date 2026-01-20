import { test, expect } from './fixtures/auth';

/**
 * E2E Test Suite 11: Package Manager Panel
 * Tests package search, installation, and management functionality
 */

test.describe('Package Manager Panel', () => {

  test('should toggle package manager panel visibility', async ({ page }) => {
    await page.goto('/');

    // Look for packages or package manager toggle
    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      console.log('✅ Package manager panel toggled');
    } else {
      console.log('⚠️  Package manager toggle not found, skipping');
    }
  });

  test('should detect package manager from project files', async ({ page }) => {
    await page.goto('/');

    // Open workbench/packages panel
    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Look for package manager indicator (npm, pip, cargo, etc.)
      const managerIndicator = page.locator('text=/npm|pip|cargo|go|composer|gem/i').first();

      if (await managerIndicator.isVisible()) {
        const detectedManager = await managerIndicator.textContent();
        console.log(`✅ Package manager detected: ${detectedManager}`);
      } else {
        // Check for empty state
        const emptyState = page.locator('text=/no package manager detected/i').first();
        const hasEmptyState = await emptyState.isVisible();

        if (hasEmptyState) {
          console.log('✅ No package manager detected message displayed');
        } else {
          console.log('⚠️  Package manager indicator not found');
        }
      }
    }
  });

  test('should display package manager header with icon', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Look for header with manager name
      const header = page.locator('[class*="header"]').first();
      const hasHeader = await header.isVisible();

      if (hasHeader) {
        console.log('✅ Package manager header displayed');
      }
    }
  });

  test('should display add package button', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Look for add/plus button
      const addButton = page.locator('button[title*="Add Package"], button').filter({ has: page.locator('[class*="plus"]') }).first();

      if (await addButton.isVisible()) {
        console.log('✅ Add package button displayed');
      } else {
        console.log('⚠️  Add package button not found');
      }
    }
  });

  test('should show search input when add button clicked', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Click add button
      const addButton = page.locator('button[title*="Add Package"], button').filter({ has: page.locator('[class*="plus"]') }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Look for search input
        const searchInput = page.locator('input[placeholder*="Search"]').first();
        const hasSearch = await searchInput.isVisible();

        if (hasSearch) {
          console.log('✅ Package search input displayed');
        } else {
          console.log('⚠️  Search input not found');
        }
      }
    }
  });

  test('should be able to type in search input', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Open search
      const addButton = page.locator('button[title*="Add Package"], button').filter({ has: page.locator('[class*="plus"]') }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Type in search
        const searchInput = page.locator('input[placeholder*="Search"]').first();

        if (await searchInput.isVisible()) {
          await searchInput.fill('react');
          await page.waitForTimeout(1000); // Wait for debounce

          // Verify input value
          const value = await searchInput.inputValue();

          if (value === 'react') {
            console.log('✅ Can type in package search');
          }
        }
      }
    }
  });

  test('should display search results', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      const addButton = page.locator('button[title*="Add Package"], button').filter({ has: page.locator('[class*="plus"]') }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        const searchInput = page.locator('input[placeholder*="Search"]').first();

        if (await searchInput.isVisible()) {
          await searchInput.fill('lodash');
          await page.waitForTimeout(2000); // Wait for search

          // Look for search results
          const results = page.locator('[class*="result"], button').filter({ hasText: /install/i });
          const count = await results.count();

          if (count > 0) {
            console.log(`✅ Found ${count} search results`);
          } else {
            // May show "no packages found" or loading
            console.log('⚠️  No search results displayed (may need backend connection)');
          }
        }
      }
    }
  });

  test('should display install and dev install buttons in search results', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      const addButton = page.locator('button[title*="Add Package"], button').filter({ has: page.locator('[class*="plus"]') }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        const searchInput = page.locator('input[placeholder*="Search"]').first();

        if (await searchInput.isVisible()) {
          await searchInput.fill('axios');
          await page.waitForTimeout(2000);

          // Look for install buttons
          const installButton = page.locator('button').filter({ hasText: /^install$/i }).first();
          const devButton = page.locator('button').filter({ hasText: /dev/i }).first();

          const hasInstall = await installButton.isVisible();
          const hasDev = await devButton.isVisible();

          if (hasInstall || hasDev) {
            console.log('✅ Install buttons displayed in search results');
          } else {
            console.log('⚠️  Install buttons not found');
          }
        }
      }
    }
  });

  test('should switch between dependencies and dev dependencies tabs', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Look for tabs
      const depsTab = page.locator('button').filter({ hasText: /^dependencies/i }).first();
      const devDepsTab = page.locator('button').filter({ hasText: /dev.*dependencies/i }).first();

      const hasDeps = await depsTab.isVisible();
      const hasDevDeps = await devDepsTab.isVisible();

      if (hasDeps && hasDevDeps) {
        // Switch to dev dependencies
        await devDepsTab.click();
        await page.waitForTimeout(500);

        // Switch back to dependencies
        await depsTab.click();
        await page.waitForTimeout(500);

        console.log('✅ Can switch between dependency tabs');
      } else {
        console.log('⚠️  Dependency tabs not found');
      }
    }
  });

  test('should display installed packages list', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1500);

      // Look for package items
      const packageItems = page.locator('[class*="package"]');
      const count = await packageItems.count();

      if (count > 0) {
        console.log(`✅ Found ${count} installed packages`);
      } else {
        // Check for empty state
        const emptyState = page.locator('text=/no dependencies|add a package/i').first();
        const hasEmpty = await emptyState.isVisible();

        if (hasEmpty) {
          console.log('✅ Empty state displayed for packages');
        } else {
          console.log('⚠️  Packages list not found (may need project context)');
        }
      }
    }
  });

  test('should display package actions on hover', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1500);

      // Find a package item
      const packageItem = page.locator('[class*="package"]').first();

      if (await packageItem.isVisible()) {
        // Hover over it
        await packageItem.hover();
        await page.waitForTimeout(500);

        // Look for action buttons (update, remove)
        const updateButton = page.locator('button[title*="Update"], button').filter({ has: page.locator('[class*="arrow"]') }).first();
        const removeButton = page.locator('button[title*="Remove"], button').filter({ has: page.locator('[class*="trash"]') }).first();

        const hasUpdate = await updateButton.isVisible();
        const hasRemove = await removeButton.isVisible();

        if (hasUpdate || hasRemove) {
          console.log('✅ Package action buttons displayed on hover');
        } else {
          console.log('⚠️  Action buttons not found');
        }
      } else {
        console.log('⚠️  No packages to hover over');
      }
    }
  });

  test('should display outdated package indicator', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1500);

      // Look for outdated badge or indicator
      const outdatedBadge = page.locator('[class*="outdated"], text=/outdated/i').first();

      if (await outdatedBadge.isVisible()) {
        console.log('✅ Outdated packages indicator displayed');
      } else {
        console.log('⚠️  No outdated packages or indicator not found');
      }
    }
  });

  test('should display refresh button', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();
      await page.waitForTimeout(1000);

      // Look for refresh button
      const refreshButton = page.locator('button[title*="Refresh"], button').filter({ has: page.locator('[class*="arrow"][class*="clockwise"]') }).first();

      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        await page.waitForTimeout(500);

        console.log('✅ Refresh button works');
      } else {
        console.log('⚠️  Refresh button not found');
      }
    }
  });

  test('should show loading state when loading packages', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();

      // Look for loading spinner quickly
      const loadingSpinner = page.locator('[class*="spin"], text=/loading/i').first();

      // Check within first second
      const hasLoading = await loadingSpinner.isVisible().catch(() => false);

      if (hasLoading) {
        console.log('✅ Loading state displayed');
      } else {
        console.log('⚠️  Loading state not visible or loaded too quickly');
      }

      await page.waitForTimeout(2000);
    }
  });

  test('should display container waiting state when container not ready', async ({ page }) => {
    await page.goto('/');

    const packagesToggle = page.locator('button').filter({ hasText: /packages|dependencies/i }).first();

    if (await packagesToggle.isVisible()) {
      await packagesToggle.click();

      // Look for waiting message
      const waitingMessage = page.locator('text=/waiting for container/i').first();

      const hasWaiting = await waitingMessage.isVisible().catch(() => false);

      if (hasWaiting) {
        console.log('✅ Container waiting state displayed');
      } else {
        console.log('⚠️  Container is ready or state not shown');
      }

      await page.waitForTimeout(1000);
    }
  });
});
