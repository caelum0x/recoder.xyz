import { Page, expect } from '@playwright/test';

export class ProjectHelper {
  constructor(private page: Page) {}

  private testProjects: string[] = [];

  async createProject(config: {
    name: string;
    description?: string;
    template: 'react' | 'nextjs' | 'vue' | 'angular' | 'custom';
    visibility?: 'public' | 'private';
    includeTests?: boolean;
    includeEslint?: boolean;
    enableTypeScript?: boolean;
    includeTailwind?: boolean;
    includeApiRoutes?: boolean;
  }): Promise<string> {
    await this.page.goto('/projects/new');
    
    // Fill basic project details
    await this.page.fill('[data-testid="project-name"]', config.name);
    if (config.description) {
      await this.page.fill('[data-testid="project-description"]', config.description);
    }
    
    // Select template
    await this.page.click(`[data-testid="template-${config.template}"]`);
    
    // Configure visibility
    if (config.visibility) {
      await this.page.selectOption('[data-testid="visibility-select"]', config.visibility);
    }
    
    // Configure options
    if (config.includeTests) {
      await this.page.check('[data-testid="include-tests"]');
    }
    
    if (config.includeEslint) {
      await this.page.check('[data-testid="include-eslint"]');
    }
    
    if (config.enableTypeScript) {
      await this.page.check('[data-testid="enable-typescript"]');
    }
    
    if (config.includeTailwind) {
      await this.page.check('[data-testid="include-tailwind"]');
    }
    
    if (config.includeApiRoutes) {
      await this.page.check('[data-testid="include-api-routes"]');
    }
    
    // Create the project
    await this.page.click('[data-testid="create-project-btn"]');
    
    // Wait for creation to complete
    await expect(this.page.locator('[data-testid="project-creation-success"]')).toBeVisible({
      timeout: 30000
    });
    
    // Get the project URL/ID for cleanup
    const url = this.page.url();
    const projectId = url.split('/').pop();
    if (projectId) {
      this.testProjects.push(projectId);
    }
    
    return projectId || '';
  }

  async navigateToProject(projectId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page.locator('[data-testid="project-dashboard"]')).toBeVisible();
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.navigateToProject(projectId);
    
    // Open project settings
    await this.page.click('[data-testid="project-settings-btn"]');
    await this.page.click('[data-testid="danger-zone-tab"]');
    
    // Delete project
    await this.page.click('[data-testid="delete-project-btn"]');
    
    // Confirm deletion
    await this.page.fill('[data-testid="confirm-delete-input"]', 'DELETE');
    await this.page.click('[data-testid="confirm-delete-btn"]');
    
    // Wait for deletion to complete
    await expect(this.page.locator('[data-testid="project-deleted-message"]')).toBeVisible();
    
    // Remove from test projects list
    this.testProjects = this.testProjects.filter(id => id !== projectId);
  }

  async cleanupTestProjects(): Promise<void> {
    for (const projectId of this.testProjects) {
      try {
        await this.deleteProject(projectId);
      } catch (error) {
        console.warn(`Failed to cleanup test project ${projectId}:`, error);
      }
    }
    this.testProjects = [];
  }

  async verifyProjectFiles(expectedFiles: string[]): Promise<void> {
    await expect(this.page.locator('[data-testid="file-explorer"]')).toBeVisible();
    
    for (const file of expectedFiles) {
      await expect(this.page.locator(`[data-testid="file-${file}"]`)).toBeVisible();
    }
  }

  async openFile(fileName: string): Promise<void> {
    await this.page.click(`[data-testid="file-${fileName}"]`);
    await expect(this.page.locator('[data-testid="code-editor"]')).toBeVisible();
  }

  async editFile(fileName: string, content: string): Promise<void> {
    await this.openFile(fileName);
    
    // Clear existing content and add new content
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.type(content);
    
    // Save file
    await this.page.keyboard.press('Control+S');
    
    // Wait for save confirmation
    await expect(this.page.locator('[data-testid="file-saved-indicator"]')).toBeVisible();
  }

  async runProject(): Promise<void> {
    await this.page.click('[data-testid="run-project-btn"]');
    
    // Wait for build to start
    await expect(this.page.locator('[data-testid="build-output"]')).toBeVisible();
    
    // Wait for build to complete (or timeout)
    await expect(this.page.locator('[data-testid="build-success"]')).toBeVisible({
      timeout: 60000
    });
  }

  async stopProject(): Promise<void> {
    await this.page.click('[data-testid="stop-project-btn"]');
    await expect(this.page.locator('[data-testid="project-stopped"]')).toBeVisible();
  }

  async shareProject(): Promise<string> {
    await this.page.click('[data-testid="share-project-btn"]');
    
    // Wait for share modal
    await expect(this.page.locator('[data-testid="share-modal"]')).toBeVisible();
    
    // Get share URL
    const shareUrl = await this.page.locator('[data-testid="share-url-input"]').inputValue();
    
    // Close modal
    await this.page.click('[data-testid="close-share-modal"]');
    
    return shareUrl;
  }

  async inviteCollaborator(email: string, role: 'viewer' | 'editor' | 'admin' = 'editor'): Promise<void> {
    await this.page.click('[data-testid="collaborators-btn"]');
    await this.page.click('[data-testid="invite-collaborator-btn"]');
    
    await this.page.fill('[data-testid="collaborator-email-input"]', email);
    await this.page.selectOption('[data-testid="collaborator-role-select"]', role);
    
    await this.page.click('[data-testid="send-invitation-btn"]');
    
    await expect(this.page.locator('[data-testid="invitation-sent-message"]')).toBeVisible();
  }

  async deployProject(platform: 'vercel' | 'netlify' | 'aws' = 'vercel'): Promise<void> {
    await this.page.click('[data-testid="deploy-btn"]');
    
    // Select deployment platform
    await this.page.click(`[data-testid="deploy-${platform}"]`);
    
    // Configure deployment settings if needed
    await this.page.click('[data-testid="start-deployment-btn"]');
    
    // Wait for deployment to complete
    await expect(this.page.locator('[data-testid="deployment-success"]')).toBeVisible({
      timeout: 120000
    });
  }

  async cloneProject(newName: string): Promise<string> {
    await this.page.click('[data-testid="project-actions-menu"]');
    await this.page.click('[data-testid="clone-project-btn"]');
    
    await this.page.fill('[data-testid="clone-project-name"]', newName);
    await this.page.click('[data-testid="confirm-clone-btn"]');
    
    await expect(this.page.locator('[data-testid="clone-success"]')).toBeVisible();
    
    // Get the cloned project ID
    const url = this.page.url();
    const projectId = url.split('/').pop();
    if (projectId) {
      this.testProjects.push(projectId);
    }
    
    return projectId || '';
  }

  async exportProject(format: 'zip' | 'git' = 'zip'): Promise<void> {
    await this.page.click('[data-testid="project-actions-menu"]');
    await this.page.click('[data-testid="export-project-btn"]');
    
    await this.page.click(`[data-testid="export-${format}"]`);
    await this.page.click('[data-testid="start-export-btn"]');
    
    // Wait for download to be initiated
    const downloadPromise = this.page.waitForEvent('download');
    const download = await downloadPromise;
    
    // Verify download was successful
    expect(download.suggestedFilename()).toContain(format);
  }

  async switchProjectVersion(version: string): Promise<void> {
    await this.page.click('[data-testid="version-selector"]');
    await this.page.click(`[data-testid="version-${version}"]`);
    
    await expect(this.page.locator('[data-testid="version-switched"]')).toBeVisible();
  }

  async createProjectFromTemplate(templateId: string, projectName: string): Promise<string> {
    await this.page.goto(`/templates/${templateId}`);
    
    await this.page.click('[data-testid="use-template-btn"]');
    await this.page.fill('[data-testid="project-name"]', projectName);
    await this.page.click('[data-testid="create-from-template-btn"]');
    
    await expect(this.page.locator('[data-testid="project-creation-success"]')).toBeVisible({
      timeout: 30000
    });
    
    const url = this.page.url();
    const projectId = url.split('/').pop();
    if (projectId) {
      this.testProjects.push(projectId);
    }
    
    return projectId || '';
  }

  async searchProjects(query: string): Promise<void> {
    await this.page.goto('/projects');
    await this.page.fill('[data-testid="project-search-input"]', query);
    await this.page.keyboard.press('Enter');
    
    await expect(this.page.locator('[data-testid="search-results"]')).toBeVisible();
  }

  async filterProjects(filter: {
    template?: string;
    visibility?: string;
    status?: string;
  }): Promise<void> {
    await this.page.goto('/projects');
    
    if (filter.template) {
      await this.page.selectOption('[data-testid="filter-template"]', filter.template);
    }
    
    if (filter.visibility) {
      await this.page.selectOption('[data-testid="filter-visibility"]', filter.visibility);
    }
    
    if (filter.status) {
      await this.page.selectOption('[data-testid="filter-status"]', filter.status);
    }
    
    await expect(this.page.locator('[data-testid="filtered-results"]')).toBeVisible();
  }
}
