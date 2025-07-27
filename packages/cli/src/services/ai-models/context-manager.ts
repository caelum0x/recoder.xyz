/**
 * Context Manager - Manages project context and conversation history for AI models
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { Logger } from '@recoder/shared';
import {
  ModelRequest,
  ModelResponse,
  RequestContext,
  TaskType,
  ModelSpecialization
} from '@recoder/shared/types/ai-models';

export interface ProjectContext {
  projectPath: string;
  projectType: string;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  fileStructure: FileNode[];
  packageInfo?: PackageInfo;
  gitInfo?: GitInfo;
  lastAnalyzed: Date;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  children?: FileNode[];
  importance: number; // 0-1 score for relevance
}

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface GitInfo {
  branch: string;
  remoteUrl?: string;
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: Date;
  };
}

export interface ConversationContext {
  id: string;
  projectPath?: string;
  messages: ContextMessage[];
  summary?: string;
  topics: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    task?: TaskType;
    files?: string[];
    tokens?: number;
  };
}

export class ContextManager {
  private projectContexts: Map<string, ProjectContext> = new Map();
  private conversations: Map<string, ConversationContext> = new Map();
  private currentConversationId?: string;
  private maxContextLength: number = 100000; // tokens
  private maxConversationHistory: number = 50; // messages

  constructor() {
  }

  public async initialize(): Promise<void> {
    Logger.info('Context manager initialized');
  }

  public async enhanceContext(context: RequestContext): Promise<RequestContext> {
    const enhanced: any = { ...context };

    // Add project context if available
    if (context.projectPath) {
      const projectContext = await this.getProjectContext(context.projectPath);
      
      enhanced.language = enhanced.language || this.detectPrimaryLanguage(projectContext);
      enhanced.framework = enhanced.framework || this.detectPrimaryFramework(projectContext);
      
      // Add relevant files to context
      if (context.task === TaskType.CODE_GENERATION || context.task === TaskType.CODE_REVIEW) {
        const relevantFiles = this.findRelevantFiles(projectContext, context.task);
        enhanced.files = relevantFiles.slice(0, 10); // Limit to top 10 relevant files
      }
    }

    return enhanced;
  }

  public async getProjectContext(projectPath: string): Promise<ProjectContext> {
    const cached = this.projectContexts.get(projectPath);
    
    if (cached && this.isContextFresh(cached)) {
      return cached;
    }

    Logger.info('Analyzing project context', { projectPath });
    
    const context = await this.analyzeProject(projectPath);
    this.projectContexts.set(projectPath, context);
    
    return context;
  }

  public async updateContext(request: ModelRequest, response: ModelResponse): Promise<void> {
    // Update conversation context
    if (this.currentConversationId) {
      await this.addToConversation(this.currentConversationId, request, response);
    }

    // Update project context if files were modified
    if (request.context?.projectPath && response.content.includes('```')) {
      // Code was generated, mark project for re-analysis
      const projectPath = request.context.projectPath;
      this.projectContexts.delete(projectPath);
    }
  }

  public async startConversation(projectPath?: string): Promise<string> {
    const conversationId = this.generateConversationId();
    
    const conversation: ConversationContext = {
      id: conversationId,
      projectPath,
      messages: [],
      topics: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.conversations.set(conversationId, conversation);
    this.currentConversationId = conversationId;
    
    Logger.info('Started new conversation', { conversationId, projectPath });
    
    return conversationId;
  }

  public async getConversationHistory(
    conversationId?: string,
    maxMessages?: number
  ): Promise<ContextMessage[]> {
    const id = conversationId || this.currentConversationId;
    
    if (!id) {
      return [];
    }

    const conversation = this.conversations.get(id);
    if (!conversation) {
      return [];
    }

    const limit = maxMessages || this.maxConversationHistory;
    return conversation.messages.slice(-limit);
  }

  public async getContextSummary(projectPath?: string): Promise<any> {
    const summary: any = {
      conversations: this.conversations.size,
      projectContexts: this.projectContexts.size,
      currentConversation: this.currentConversationId
    };

    if (projectPath) {
      const projectContext = this.projectContexts.get(projectPath);
      if (projectContext) {
        summary.project = {
          type: projectContext.projectType,
          languages: projectContext.languages,
          frameworks: projectContext.frameworks,
          fileCount: this.countFiles(projectContext.fileStructure),
          lastAnalyzed: projectContext.lastAnalyzed
        };
      }
    }

    return summary;
  }

  public truncateContext(content: string, maxTokens: number): string {
    // Simple truncation - in practice would use proper tokenization
    const estimatedTokens = Math.ceil(content.length / 4);
    
    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const targetLength = maxTokens * 4;
    const truncated = content.substring(0, targetLength);
    
    // Try to truncate at a natural boundary
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > targetLength * 0.8) {
      return truncated.substring(0, lastNewline) + '\n... [truncated]';
    }

    return truncated + '... [truncated]';
  }

  private async analyzeProject(projectPath: string): Promise<ProjectContext> {
    const context: ProjectContext = {
      projectPath,
      projectType: 'unknown',
      languages: [],
      frameworks: [],
      dependencies: [],
      fileStructure: [],
      lastAnalyzed: new Date()
    };

    try {
      // Analyze package.json if exists
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        context.packageInfo = await fs.readJson(packageJsonPath);
        context.projectType = 'node';
        context.dependencies = [
          ...Object.keys(context.packageInfo?.dependencies || {}),
          ...Object.keys(context.packageInfo?.devDependencies || {})
        ];
      }

      // Analyze file structure
      context.fileStructure = await this.analyzeFileStructure(projectPath);
      
      // Detect languages
      context.languages = this.detectLanguages(context.fileStructure);
      
      // Detect frameworks
      context.frameworks = this.detectFrameworks(context.dependencies, context.fileStructure);
      
      // Get git info if available
      context.gitInfo = await this.getGitInfo(projectPath);
      
      Logger.info('Project analysis completed', {
        projectPath,
        projectType: context.projectType,
        languages: context.languages,
        frameworks: context.frameworks,
        fileCount: this.countFiles(context.fileStructure)
      });
    } catch (error) {
      Logger.warn('Project analysis failed', { projectPath, error });
    }

    return context;
  }

  private async analyzeFileStructure(
    projectPath: string,
    maxDepth: number = 3,
    currentDepth: number = 0
  ): Promise<FileNode[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const items = await fs.readdir(projectPath);
    const nodes: FileNode[] = [];

    const ignoreDirs = new Set([
      'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
      'coverage', '.vscode', '.idea', '__pycache__', '.pytest_cache'
    ]);

    for (const item of items) {
      if (item.startsWith('.') && !item.startsWith('.env')) {
        continue;
      }

      if (ignoreDirs.has(item)) {
        continue;
      }

      const itemPath = path.join(projectPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        const children = await this.analyzeFileStructure(itemPath, maxDepth, currentDepth + 1);
        
        nodes.push({
          name: item,
          path: itemPath,
          type: 'directory',
          children,
          importance: this.calculateDirectoryImportance(item, children)
        });
      } else {
        const language = this.detectFileLanguage(item);
        const importance = this.calculateFileImportance(item, stats.size);
        
        nodes.push({
          name: item,
          path: itemPath,
          type: 'file',
          size: stats.size,
          language,
          importance
        });
      }
    }

    return nodes.sort((a, b) => b.importance - a.importance);
  }

  private detectLanguages(fileStructure: FileNode[]): string[] {
    const languageCounts: Record<string, number> = {};
    
    const countLanguages = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file' && node.language) {
          languageCounts[node.language] = (languageCounts[node.language] || 0) + 1;
        } else if (node.type === 'directory' && node.children) {
          countLanguages(node.children);
        }
      }
    };

    countLanguages(fileStructure);
    
    return Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([lang]) => lang);
  }

  private detectFrameworks(dependencies: string[], fileStructure: FileNode[]): string[] {
    const frameworks: Set<string> = new Set();

    // Detect from dependencies
    const frameworkMap: Record<string, string> = {
      'react': 'React',
      'vue': 'Vue.js',
      'angular': 'Angular',
      'svelte': 'Svelte',
      'next': 'Next.js',
      'nuxt': 'Nuxt.js',
      'express': 'Express.js',
      'fastify': 'Fastify',
      'nest': 'NestJS',
      'django': 'Django',
      'flask': 'Flask',
      'rails': 'Ruby on Rails',
      'laravel': 'Laravel',
      'spring': 'Spring Boot'
    };

    for (const dep of dependencies) {
      for (const [key, framework] of Object.entries(frameworkMap)) {
        if (dep.toLowerCase().includes(key)) {
          frameworks.add(framework);
        }
      }
    }

    // Detect from file structure
    const hasFile = (name: string): boolean => {
      const checkFiles = (nodes: FileNode[]): boolean => {
        for (const node of nodes) {
          if (node.name === name) return true;
          if (node.children && checkFiles(node.children)) return true;
        }
        return false;
      };
      return checkFiles(fileStructure);
    };

    if (hasFile('angular.json')) frameworks.add('Angular');
    if (hasFile('vue.config.js')) frameworks.add('Vue.js');
    if (hasFile('svelte.config.js')) frameworks.add('Svelte');
    if (hasFile('next.config.js')) frameworks.add('Next.js');
    if (hasFile('nuxt.config.js')) frameworks.add('Nuxt.js');

    return Array.from(frameworks);
  }

  private detectFileLanguage(filename: string): string | undefined {
    const ext = path.extname(filename).toLowerCase();
    
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.sol': 'solidity',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.sql': 'sql',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml'
    };

    return languageMap[ext];
  }

  private calculateFileImportance(filename: string, size: number): number {
    let importance = 0.5; // Base importance

    // Important file types
    const importantFiles = [
      'package.json', 'package-lock.json', 'yarn.lock',
      'Dockerfile', 'docker-compose.yml',
      'README.md', 'LICENSE',
      '.env', '.env.example',
      'tsconfig.json', 'jsconfig.json',
      'webpack.config.js', 'vite.config.js'
    ];

    if (importantFiles.includes(filename)) {
      importance += 0.4;
    }

    // Configuration files
    if (filename.includes('config') || filename.includes('settings')) {
      importance += 0.2;
    }

    // Main entry files
    if (['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts'].includes(filename)) {
      importance += 0.3;
    }

    // Size factor (larger files might be more important, but not always)
    if (size > 1000 && size < 50000) {
      importance += 0.1;
    }

    return Math.min(1, importance);
  }

  private calculateDirectoryImportance(dirname: string, children: FileNode[]): number {
    let importance = 0.3; // Base importance

    // Important directories
    const importantDirs = ['src', 'lib', 'components', 'pages', 'routes', 'api', 'models', 'controllers'];
    
    if (importantDirs.includes(dirname)) {
      importance += 0.4;
    }

    // Based on children importance
    if (children.length > 0) {
      const avgChildImportance = children.reduce((sum, child) => sum + child.importance, 0) / children.length;
      importance += avgChildImportance * 0.3;
    }

    return Math.min(1, importance);
  }

  private detectPrimaryLanguage(context: ProjectContext): string | undefined {
    return context.languages[0];
  }

  private detectPrimaryFramework(context: ProjectContext): string | undefined {
    return context.frameworks[0];
  }

  private findRelevantFiles(context: ProjectContext, task: TaskType): string[] {
    const relevantFiles: Array<{ path: string; importance: number }> = [];

    const collectFiles = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          let relevance = node.importance;

          // Boost relevance based on task
          if (task === TaskType.CODE_GENERATION || task === TaskType.CODE_REVIEW) {
            if (node.language && ['javascript', 'typescript', 'python', 'java'].includes(node.language)) {
              relevance += 0.2;
            }
          }

          relevantFiles.push({ path: node.path, importance: relevance });
        } else if (node.children) {
          collectFiles(node.children);
        }
      }
    };

    collectFiles(context.fileStructure);
    
    return relevantFiles
      .sort((a, b) => b.importance - a.importance)
      .map(f => f.path);
  }

  private async getGitInfo(projectPath: string): Promise<GitInfo | undefined> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      const gitDir = path.join(projectPath, '.git');
      if (!await fs.pathExists(gitDir)) {
        return undefined;
      }

      const [branchResult, remoteResult] = await Promise.all([
        execAsync('git branch --show-current', { cwd: projectPath }),
        execAsync('git remote get-url origin', { cwd: projectPath }).catch(() => ({ stdout: '' }))
      ]);

      return {
        branch: branchResult.stdout.trim(),
        remoteUrl: remoteResult.stdout.trim() || undefined
      };
    } catch (error) {
      return undefined;
    }
  }

  private async addToConversation(
    conversationId: string,
    request: ModelRequest,
    response: ModelResponse
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: request.messages[request.messages.length - 1]?.content || '',
      timestamp: request.timestamp,
      metadata: {
        task: request.context?.task,
        model: request.model,
        files: (request.context as any)?.files
      }
    });

    // Add assistant response
    conversation.messages.push({
      role: 'assistant',
      content: response.content,
      timestamp: response.metadata.timestamp,
      metadata: {
        model: response.model,
        tokens: response.usage.totalTokens
      }
    });

    conversation.updatedAt = new Date();

    // Trim old messages if needed
    if (conversation.messages.length > this.maxConversationHistory * 2) {
      conversation.messages = conversation.messages.slice(-this.maxConversationHistory);
    }
  }

  private isContextFresh(context: ProjectContext): boolean {
    const maxAge = 60 * 60 * 1000; // 1 hour
    return Date.now() - context.lastAnalyzed.getTime() < maxAge;
  }

  private countFiles(nodes: FileNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.type === 'file') {
        count++;
      } else if (node.children) {
        count += this.countFiles(node.children);
      }
    }
    return count;
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}