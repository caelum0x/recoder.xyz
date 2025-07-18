/**
 * Template service for template management
 */

import axios, { AxiosInstance } from 'axios';
import path from 'path';
import fs from 'fs-extra';
import { ConfigManager } from '../utils/config';
import { Logger } from '@recoder/shared';

export interface TemplateConfig {
  name: string;
  description: string;
  category: string;
  type: string;
  source: string;
  tags: string[];
  public: boolean;
}

export interface TemplateResponse {
  success: boolean;
  template?: any;
  templates?: any[];
  error?: string;
}

class TemplateManagementService {
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

  async listTemplates(token: string | null, options: any = {}): Promise<TemplateResponse> {
    try {
      const params = new URLSearchParams();
      
      if (options.category) params.append('category', options.category);
      if (options.type) params.append('type', options.type);
      if (options.mine) params.append('mine', 'true');
      if (options.public) params.append('public', 'true');
      if (options.featured) params.append('featured', 'true');

      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await this.api.get(`/templates?${params}`, { headers });

      return {
        success: true,
        templates: response.data.templates,
      };
    } catch (error: any) {
      Logger.error(`Failed to list templates: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to list templates',
      };
    }
  }

  async getTemplate(templateId: string): Promise<TemplateResponse> {
    try {
      const response = await this.api.get(`/templates/${templateId}`);

      return {
        success: true,
        template: response.data.template,
      };
    } catch (error: any) {
      Logger.error(`Failed to get template: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get template',
      };
    }
  }

  async createTemplate(token: string, config: TemplateConfig): Promise<any> {
    try {
      // Scan source directory for files
      const templateData = await this.scanTemplateDirectory(config.source);
      
      const response = await this.api.post('/templates', 
        {
          ...config,
          files: templateData.files,
          variables: templateData.variables,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const { template } = response.data;

      Logger.info(`Template created: ${template.name} (${template.id})`);

      return {
        success: true,
        template,
      };
    } catch (error: any) {
      Logger.error(`Template creation failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template creation failed',
      };
    }
  }

  async useTemplate(templateId: string, options: any): Promise<any> {
    try {
      const response = await this.api.post(`/templates/${templateId}/use`, options);

      const { generation } = response.data;

      // Download and extract generated files
      await this.extractGeneratedFiles(generation, options.outputDir);

      Logger.info(`Template generated: ${generation.filesCreated} files created`);

      return {
        success: true,
        generation,
      };
    } catch (error: any) {
      Logger.error(`Template usage failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template usage failed',
      };
    }
  }

  async deleteTemplate(token: string, templateId: string): Promise<TemplateResponse> {
    try {
      await this.api.delete(`/templates/${templateId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Logger.info(`Template deleted: ${templateId}`);

      return {
        success: true,
      };
    } catch (error: any) {
      Logger.error(`Template deletion failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template deletion failed',
      };
    }
  }

  async cloneTemplate(token: string, templateId: string, options: any = {}): Promise<any> {
    try {
      const response = await this.api.post(`/templates/${templateId}/clone`, options, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { template } = response.data;

      Logger.info(`Template cloned: ${templateId} -> ${template.id}`);

      return {
        success: true,
        template,
      };
    } catch (error: any) {
      Logger.error(`Template cloning failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template cloning failed',
      };
    }
  }

  async publishTemplate(token: string, templateId: string, options: any = {}): Promise<any> {
    try {
      const response = await this.api.post(`/templates/${templateId}/publish`, options, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Logger.info(`Template published: ${templateId}`);

      return {
        success: true,
        registryUrl: response.data.registryUrl,
      };
    } catch (error: any) {
      Logger.error(`Template publishing failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template publishing failed',
      };
    }
  }

  async searchTemplates(query: string, options: any = {}): Promise<TemplateResponse> {
    try {
      const params = new URLSearchParams();
      params.append('q', query);
      
      if (options.category) params.append('category', options.category);
      if (options.tags) {
        options.tags.forEach((tag: string) => params.append('tags', tag));
      }
      if (options.limit) params.append('limit', options.limit.toString());

      const response = await this.api.get(`/templates/search?${params}`);

      return {
        success: true,
        templates: response.data.templates,
      };
    } catch (error: any) {
      Logger.error(`Template search failed: ${error.response?.data?.message || error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || 'Template search failed',
      };
    }
  }

  private async scanTemplateDirectory(sourcePath: string): Promise<any> {
    const templateData: any = {
      files: [],
      variables: [],
    };

    try {
      await this.scanDirectory(sourcePath, templateData, sourcePath);
      
      // Extract variables from template files
      templateData.variables = this.extractVariables(templateData.files);
    } catch (error) {
      Logger.error(`Failed to scan template directory: ${error}`);
      throw error;
    }

    return templateData;
  }

  private async scanDirectory(dirPath: string, templateData: any, rootPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        // Skip common ignored files
        if (this.shouldIgnoreFile(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, templateData, rootPath);
        } else {
          const relativePath = path.relative(rootPath, fullPath);
          const stats = await fs.stat(fullPath);
          
          // Determine if file is binary
          const isBinary = await this.isBinaryFile(fullPath);
          
          const fileData: any = {
            path: relativePath,
            size: stats.size,
            binary: isBinary,
            template: false,
          };

          if (!isBinary) {
            const content = await fs.readFile(fullPath, 'utf8');
            fileData.content = content;
            fileData.template = this.hasTemplateVariables(content);
          }

          templateData.files.push(fileData);
        }
      }
    } catch (error) {
      Logger.warn(`Failed to scan directory ${dirPath}: ${error}`);
    }
  }

  private shouldIgnoreFile(name: string): boolean {
    const ignoredPatterns = [
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      'dist',
      'build',
      '.next',
      'coverage',
      '.DS_Store',
      'Thumbs.db',
      '*.log',
    ];

    return ignoredPatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath);
      
      // Check for null bytes (common in binary files)
      for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      // Check file extension
      const ext = path.extname(filePath).toLowerCase();
      const binaryExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
        '.pdf', '.zip', '.tar', '.gz', '.rar',
        '.exe', '.dll', '.so', '.dylib',
        '.mp3', '.mp4', '.avi', '.mov',
        '.woff', '.woff2', '.ttf', '.eot',
      ];

      return binaryExtensions.includes(ext);
    } catch (error) {
      return false;
    }
  }

  private hasTemplateVariables(content: string): boolean {
    // Check for common template variable patterns
    const patterns = [
      /\{\{.*?\}\}/g,      // Handlebars: {{variable}}
      /\$\{.*?\}/g,        // Template literals: ${variable}
      /__.*?__/g,          // Python style: __variable__
      /<%.*?%>/g,          // EJS style: <%variable%>
    ];

    return patterns.some(pattern => pattern.test(content));
  }

  private extractVariables(files: any[]): any[] {
    const variables = new Set<string>();
    
    for (const file of files) {
      if (!file.template || !file.content) continue;
      
      // Extract Handlebars-style variables
      const handlebarsMatches = file.content.match(/\{\{(.*?)\}\}/g);
      if (handlebarsMatches) {
        handlebarsMatches.forEach((match: string) => {
          const variable = match.replace(/[{}]/g, '').trim();
          if (variable && !variable.includes(' ')) {
            variables.add(variable);
          }
        });
      }

      // Extract template literal variables
      const templateMatches = file.content.match(/\$\{(.*?)\}/g);
      if (templateMatches) {
        templateMatches.forEach((match: string) => {
          const variable = match.replace(/[${}]/g, '').trim();
          if (variable && !variable.includes(' ')) {
            variables.add(variable);
          }
        });
      }
    }

    return Array.from(variables).map(name => ({
      name,
      type: 'string',
      description: `Template variable: ${name}`,
      required: false,
    }));
  }

  private async extractGeneratedFiles(generation: any, outputDir: string): Promise<void> {
    try {
      // Ensure output directory exists
      await fs.ensureDir(outputDir);

      // This would typically download and extract files from the generation response
      // For now, we'll simulate the file creation process
      if (generation.files) {
        for (const file of generation.files) {
          const filePath = path.join(outputDir, file.path);
          
          // Ensure directory exists
          await fs.ensureDir(path.dirname(filePath));
          
          if (file.binary) {
            // Handle binary files (would typically download from URL)
            await fs.writeFile(filePath, Buffer.from(file.content, 'base64'));
          } else {
            // Handle text files
            await fs.writeFile(filePath, file.content, 'utf8');
          }
        }
      }

      Logger.info(`Template files extracted to: ${outputDir}`);
    } catch (error) {
      Logger.error(`Failed to extract generated files: ${error}`);
      throw error;
    }
  }
}

// Export singleton instance
export const TemplateService = new TemplateManagementService();