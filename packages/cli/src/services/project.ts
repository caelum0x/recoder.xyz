/**
 * Project service for project management and code generation
 */

import axios, { AxiosInstance } from 'axios';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { ConfigManager } from '../utils/config';
import { Logger } from 'recoder-shared';

export interface ProjectConfig {
  name: string;
  description: string;
  type: string;
  path: string;
  template: string;
  features: string[];
  integrations: string[];
}

export interface ProjectResponse {
  success: boolean;
  project?: any;
  projects?: any[];
  error?: string;
}

class ProjectManagementService {
  private api: AxiosInstance;

  constructor() {
    const apiConfig = ConfigManager.getApiConfig();
    
    this.api = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Recoder CLI/1.0.0',
      },
    });
  }

  async initializeProject(token: string, config: ProjectConfig): Promise<any> {
    try {
      const response = await this.api.post('/projects', config, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { project } = response.data;

      // Create local project structure
      await this.createLocalProjectStructure(project);

      Logger.info(`Project initialized: ${project.name} (${project.id})`);

      return {
        success: true,
        project,
      };
    } catch (error: any) {
      Logger.error(`Project initialization failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Project initialization failed',
      };
    }
  }

  async listProjects(token: string, options: any = {}): Promise<ProjectResponse> {
    try {
      const params = new URLSearchParams();
      
      if (options.filter) params.append('type', options.filter);
      if (options.local) params.append('local', 'true');
      if (options.remote) params.append('remote', 'true');

      const response = await this.api.get(`/projects?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      let projects = response.data.projects;

      // If showing local projects, scan for local CodeCraft projects
      if (options.local || !options.remote) {
        const localProjects = await this.scanLocalProjects();
        projects = [...projects, ...localProjects];
      }

      return {
        success: true,
        projects,
      };
    } catch (error: any) {
      Logger.error(`Failed to list projects: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list projects',
      };
    }
  }

  async getProject(token: string, projectId: string): Promise<ProjectResponse> {
    try {
      const response = await this.api.get(`/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        project: response.data.project,
      };
    } catch (error: any) {
      Logger.error(`Failed to get project: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get project',
      };
    }
  }

  async getLocalProject(projectPath: string): Promise<ProjectResponse> {
    try {
      const planFile = path.join(projectPath, 'codecraft.json');
      
      if (!await fs.pathExists(planFile)) {
        return {
          success: false,
          error: 'No CodeCraft project found in this directory',
        };
      }

      const projectData = await fs.readJson(planFile);
      
      // Add local metadata
      const stats = await fs.stat(planFile);
      projectData.path = projectPath;
      projectData.lastModified = stats.mtime;
      projectData.local = true;

      return {
        success: true,
        project: projectData,
      };
    } catch (error: any) {
      Logger.error(`Failed to get local project: ${error.message}`);
      return {
        success: false,
        error: 'Failed to read local project data',
      };
    }
  }

  async generateCode(token: string, planFile: string, options: any): Promise<any> {
    try {
      // Read plan file
      const planData = await fs.readJson(planFile);
      
      const response = await this.api.post('/projects/generate', 
        {
          plan: planData,
          options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 300000, // 5 minutes for code generation
        }
      );

      const { generation } = response.data;

      Logger.info(`Code generation completed: ${generation.filesCreated} files created`);

      return {
        success: true,
        generation,
      };
    } catch (error: any) {
      Logger.error(`Code generation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Code generation failed',
      };
    }
  }

  async analyzeProject(token: string, projectPath: string, options: any): Promise<any> {
    try {
      // Get project files and structure
      const projectData = await this.scanProjectStructure(projectPath);
      
      const response = await this.api.post('/projects/analyze', 
        {
          projectData,
          options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 120000, // 2 minutes for analysis
        }
      );

      Logger.info('Project analysis completed');

      return {
        success: true,
        analysis: response.data.analysis,
      };
    } catch (error: any) {
      Logger.error(`Project analysis failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Project analysis failed',
      };
    }
  }

  async validateProject(token: string, projectPath: string, options: any): Promise<any> {
    try {
      // Get project files and structure
      const projectData = await this.scanProjectStructure(projectPath);
      
      const response = await this.api.post('/projects/validate', 
        {
          projectData,
          options,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Logger.info('Project validation completed');

      return {
        success: true,
        validation: response.data.validation,
      };
    } catch (error: any) {
      Logger.error(`Project validation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Project validation failed',
      };
    }
  }

  async addFeature(token: string, projectPath: string, feature: string, config: any): Promise<any> {
    try {
      // Read current project plan
      const planFile = path.join(projectPath, 'codecraft.json');
      const planData = await fs.readJson(planFile);
      
      const response = await this.api.post('/projects/features', 
        {
          projectId: planData.id,
          feature,
          config,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Logger.info(`Feature added: ${feature}`);

      return {
        success: true,
        feature: response.data.feature,
      };
    } catch (error: any) {
      Logger.error(`Feature addition failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Feature addition failed',
      };
    }
  }

  async getFeatureTemplates(token: string, featureType: string): Promise<any> {
    try {
      const response = await this.api.get(`/features/templates?type=${featureType}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return {
        success: true,
        templates: response.data.templates,
      };
    } catch (error: any) {
      Logger.error(`Failed to get feature templates: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get feature templates',
      };
    }
  }

  async validateChanges(token: string, projectPath: string, changes: string[]): Promise<any> {
    try {
      const response = await this.api.post('/projects/validate-changes', 
        {
          projectPath,
          changes,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return {
        success: true,
        issues: response.data.issues,
      };
    } catch (error: any) {
      Logger.error(`Change validation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Change validation failed',
      };
    }
  }

  async syncProject(token: string, projectPath: string): Promise<any> {
    try {
      // Read local project data
      const projectData = await this.getLocalProject(projectPath);
      
      if (!projectData.success) {
        return projectData;
      }

      const response = await this.api.post('/projects/sync', 
        {
          project: projectData.project,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Logger.info('Project synced with remote');

      return {
        success: true,
        syncResult: response.data.syncResult,
      };
    } catch (error: any) {
      Logger.error(`Project sync failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Project sync failed',
      };
    }
  }

  private async createLocalProjectStructure(project: any): Promise<void> {
    const projectPath = project.path;
    
    // Create directory structure
    await fs.ensureDir(projectPath);
    
    // Create codecraft.json file
    const planData = {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      template: project.template,
      features: project.features,
      integrations: project.integrations,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await fs.writeJson(path.join(projectPath, 'codecraft.json'), planData, { spaces: 2 });
    
    // Create basic directory structure
    await fs.ensureDir(path.join(projectPath, 'src'));
    await fs.ensureDir(path.join(projectPath, 'docs'));
    await fs.ensureDir(path.join(projectPath, 'tests'));
    
    // Create basic README
    const readmeContent = `# ${project.name}

${project.description}

## Getting Started

This project was created with CodeCraft. To generate the production code:

\`\`\`bash
codecraft project generate
\`\`\`

## Features

${project.features.map((feature: string) => `- ${feature}`).join('\n')}

## Integrations

${project.integrations.map((integration: string) => `- ${integration}`).join('\n')}
`;
    
    await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent);
  }

  private async scanLocalProjects(): Promise<any[]> {
    const projects: any[] = [];
    
    try {
      // Scan current directory and common project directories
      const searchPaths = [
        process.cwd(),
        path.join(os.homedir(), 'projects'),
        path.join(os.homedir(), 'dev'),
        path.join(os.homedir(), 'code'),
      ];

      for (const searchPath of searchPaths) {
        if (await fs.pathExists(searchPath)) {
          const localProjects = await this.scanDirectoryForProjects(searchPath);
          projects.push(...localProjects);
        }
      }
    } catch (error) {
      Logger.warn(`Failed to scan local projects: ${error}`);
    }

    return projects;
  }

  private async scanDirectoryForProjects(dirPath: string, maxDepth: number = 2): Promise<any[]> {
    const projects: any[] = [];
    
    try {
      if (maxDepth <= 0) return projects;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const fullPath = path.join(dirPath, entry.name);
          const planFile = path.join(fullPath, 'codecraft.json');
          
          if (await fs.pathExists(planFile)) {
            try {
              const projectData = await fs.readJson(planFile);
              const stats = await fs.stat(planFile);
              
              projects.push({
                ...projectData,
                path: fullPath,
                lastModified: stats.mtime,
                local: true,
              });
            } catch (error) {
              // Skip invalid project files
            }
          } else {
            // Recursively scan subdirectories
            const subProjects = await this.scanDirectoryForProjects(fullPath, maxDepth - 1);
            projects.push(...subProjects);
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }

    return projects;
  }

  private async scanProjectStructure(projectPath: string): Promise<any> {
    const structure: any = {
      path: projectPath,
      files: [],
      directories: [],
      packageJson: null,
      gitignore: null,
      readme: null,
    };

    try {
      await this.scanDirectory(projectPath, structure, 0, 3); // Max depth of 3
      
      // Read important files
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        structure.packageJson = await fs.readJson(packageJsonPath);
      }

      const gitignorePath = path.join(projectPath, '.gitignore');
      if (await fs.pathExists(gitignorePath)) {
        structure.gitignore = await fs.readFile(gitignorePath, 'utf8');
      }

      const readmePath = path.join(projectPath, 'README.md');
      if (await fs.pathExists(readmePath)) {
        structure.readme = await fs.readFile(readmePath, 'utf8');
      }
    } catch (error) {
      Logger.warn(`Failed to scan project structure: ${error}`);
    }

    return structure;
  }

  private async scanDirectory(dirPath: string, structure: any, currentDepth: number, maxDepth: number): Promise<void> {
    if (currentDepth >= maxDepth) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(structure.path, fullPath);
        
        // Skip common ignored directories and files
        if (this.shouldIgnore(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          structure.directories.push(relativePath);
          await this.scanDirectory(fullPath, structure, currentDepth + 1, maxDepth);
        } else {
          const stats = await fs.stat(fullPath);
          structure.files.push({
            path: relativePath,
            size: stats.size,
            modified: stats.mtime,
            extension: path.extname(entry.name),
          });
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  private shouldIgnore(name: string): boolean {
    const ignoredPatterns = [
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      'dist',
      'build',
      '.next',
      'coverage',
      '.nyc_output',
      'logs',
      '*.log',
      '.DS_Store',
      'Thumbs.db',
    ];

    return ignoredPatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }
}

// Export singleton instance
export const ProjectService = new ProjectManagementService();