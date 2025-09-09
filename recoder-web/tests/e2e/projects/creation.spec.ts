import { test, expect } from '@playwright/test';
import { LoginHelper } from '../helpers/login-helper';
import { ProjectHelper } from '../helpers/project-helper';

test.describe('Project Creation Flow', () => {
  let loginHelper: LoginHelper;
  let projectHelper: ProjectHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    projectHelper = new ProjectHelper(page);
    
    // Navigate to the application
    await page.goto('/');
    
    // Ensure user is logged in
    await loginHelper.ensureLoggedIn();
  });

  test('should create a new React project successfully', async ({ page }) => {
    // Navigate to project creation
    await page.goto('/projects/new');
    
    // Wait for the page to load
    await expect(page.locator('h1')).toContainText(/create.*project/i);
    
    // Fill project details
    const projectName = `test-react-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    await page.fill('[data-testid="project-description"]', 'Test React project created by E2E tests');
    
    // Select React template
    await page.click('[data-testid="template-react"]');
    
    // Verify template selection
    await expect(page.locator('[data-testid="template-react"]')).toHaveClass(/selected|active/);
    
    // Configure project settings
    await page.selectOption('[data-testid="visibility-select"]', 'private');
    await page.check('[data-testid="include-tests"]');
    await page.check('[data-testid="include-eslint"]');
    
    // Create the project
    await page.click('[data-testid="create-project-btn"]');
    
    // Wait for project creation to complete
    await expect(page.locator('[data-testid="project-creation-success"]')).toBeVisible({
      timeout: 30000
    });
    
    // Verify redirection to project dashboard
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9-]+/);
    
    // Verify project name appears in the UI
    await expect(page.locator('[data-testid="project-title"]')).toContainText(projectName);
    
    // Verify project files are created
    await expect(page.locator('[data-testid="file-explorer"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-package-json"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-src-index"]')).toBeVisible();
  });

  test('should create a new Next.js project with TypeScript', async ({ page }) => {
    await page.goto('/projects/new');
    
    const projectName = `test-nextjs-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    await page.fill('[data-testid="project-description"]', 'Test Next.js project with TypeScript');
    
    // Select Next.js template
    await page.click('[data-testid="template-nextjs"]');
    
    // Enable TypeScript
    await page.check('[data-testid="enable-typescript"]');
    
    // Configure additional options
    await page.check('[data-testid="include-tailwind"]');
    await page.check('[data-testid="include-api-routes"]');
    
    await page.click('[data-testid="create-project-btn"]');
    
    // Wait for creation success
    await expect(page.locator('[data-testid="project-creation-success"]')).toBeVisible({
      timeout: 30000
    });
    
    // Verify TypeScript files are created
    await expect(page.locator('[data-testid="file-tsconfig-json"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-next-config-ts"]')).toBeVisible();
  });

  test('should validate project name requirements', async ({ page }) => {
    await page.goto('/projects/new');
    
    // Test empty project name
    await page.click('[data-testid="create-project-btn"]');
    await expect(page.locator('[data-testid="project-name-error"]')).toContainText(/required/i);
    
    // Test invalid project name (with spaces)
    await page.fill('[data-testid="project-name"]', 'invalid project name');
    await page.click('[data-testid="create-project-btn"]');
    await expect(page.locator('[data-testid="project-name-error"]')).toContainText(/invalid/i);
    
    // Test name too short
    await page.fill('[data-testid="project-name"]', 'ab');
    await page.click('[data-testid="create-project-btn"]');
    await expect(page.locator('[data-testid="project-name-error"]')).toContainText(/too short/i);
    
    // Test name too long
    const longName = 'a'.repeat(100);
    await page.fill('[data-testid="project-name"]', longName);
    await page.click('[data-testid="create-project-btn"]');
    await expect(page.locator('[data-testid="project-name-error"]')).toContainText(/too long/i);
  });

  test('should handle template selection correctly', async ({ page }) => {
    await page.goto('/projects/new');
    
    // Test React template selection
    await page.click('[data-testid="template-react"]');
    await expect(page.locator('[data-testid="template-options-react"]')).toBeVisible();
    
    // Test Vue template selection
    await page.click('[data-testid="template-vue"]');
    await expect(page.locator('[data-testid="template-options-vue"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-options-react"]')).not.toBeVisible();
    
    // Test Angular template selection
    await page.click('[data-testid="template-angular"]');
    await expect(page.locator('[data-testid="template-options-angular"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-options-vue"]')).not.toBeVisible();
  });

  test('should create project with custom configuration', async ({ page }) => {
    await page.goto('/projects/new');
    
    const projectName = `test-custom-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    
    // Select custom/blank template
    await page.click('[data-testid="template-custom"]');
    
    // Configure custom settings
    await page.selectOption('[data-testid="language-select"]', 'typescript');
    await page.selectOption('[data-testid="bundler-select"]', 'vite');
    await page.selectOption('[data-testid="package-manager-select"]', 'npm');
    
    // Add dependencies
    await page.fill('[data-testid="dependencies-input"]', 'react, react-dom, axios');
    await page.fill('[data-testid="dev-dependencies-input"]', 'typescript, vite, @types/react');
    
    await page.click('[data-testid="create-project-btn"]');
    
    await expect(page.locator('[data-testid="project-creation-success"]')).toBeVisible({
      timeout: 30000
    });
    
    // Verify custom configuration is applied
    await expect(page.locator('[data-testid="project-config-typescript"]')).toBeVisible();
    await expect(page.locator('[data-testid="project-config-vite"]')).toBeVisible();
  });

  test('should show loading state during project creation', async ({ page }) => {
    await page.goto('/projects/new');
    
    const projectName = `test-loading-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    await page.click('[data-testid="template-react"]');
    
    // Click create and immediately check for loading state
    await page.click('[data-testid="create-project-btn"]');
    
    // Verify loading indicators
    await expect(page.locator('[data-testid="project-creation-loading"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-project-btn"]')).toBeDisabled();
    
    // Verify progress indicators
    await expect(page.locator('[data-testid="creation-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="creation-step-1"]')).toHaveClass(/active|current/);
  });

  test('should handle project creation errors gracefully', async ({ page }) => {
    // Mock a network error
    await page.route('/api/projects', route => {
      route.abort('failed');
    });
    
    await page.goto('/projects/new');
    
    const projectName = `test-error-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    await page.click('[data-testid="template-react"]');
    await page.click('[data-testid="create-project-btn"]');
    
    // Verify error handling
    await expect(page.locator('[data-testid="project-creation-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(/failed to create/i);
    
    // Verify retry button is available
    await expect(page.locator('[data-testid="retry-creation-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="create-project-btn"]')).toBeEnabled();
  });

  test('should navigate back to projects list', async ({ page }) => {
    await page.goto('/projects/new');
    
    // Click back button
    await page.click('[data-testid="back-to-projects-btn"]');
    
    // Verify navigation to projects list
    await expect(page).toHaveURL('/projects');
    await expect(page.locator('[data-testid="projects-list"]')).toBeVisible();
  });

  test('should save draft and restore project configuration', async ({ page }) => {
    await page.goto('/projects/new');
    
    // Fill some project details
    const projectName = `test-draft-project-${Date.now()}`;
    await page.fill('[data-testid="project-name"]', projectName);
    await page.fill('[data-testid="project-description"]', 'Draft project description');
    await page.click('[data-testid="template-vue"]');
    
    // Save as draft
    await page.click('[data-testid="save-draft-btn"]');
    await expect(page.locator('[data-testid="draft-saved-notification"]')).toBeVisible();
    
    // Navigate away and back
    await page.goto('/projects');
    await page.goto('/projects/new');
    
    // Verify draft is restored
    await expect(page.locator('[data-testid="project-name"]')).toHaveValue(projectName);
    await expect(page.locator('[data-testid="project-description"]')).toHaveValue('Draft project description');
    await expect(page.locator('[data-testid="template-vue"]')).toHaveClass(/selected|active/);
  });

  test.afterEach(async ({ page }) => {
    // Clean up created projects
    await projectHelper.cleanupTestProjects();
  });
});
