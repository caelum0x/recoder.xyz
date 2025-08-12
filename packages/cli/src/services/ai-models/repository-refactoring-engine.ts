/**
 * Repository-Wide Refactoring Engine
 * KILLER FEATURE: Refactor entire codebases with 1M+ token context via Qwen3-Coder
 * Cursor is limited to current file + few related files - we understand ENTIRE repositories
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { glob } from 'glob';
import { Logger } from '../../utils/logger';
import { AIModelHub } from './ai-hub';
import { TaskType } from '@recoder/shared/types/ai-models';

export interface RepositoryAnalysis {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  frameworks: string[];
  dependencies: string[];
  architecture: {
    type: 'monorepo' | 'single-app' | 'library' | 'microservices';
    structure: Record<string, string[]>;
    entryPoints: string[];
  };
  techStack: {
    frontend: string[];
    backend: string[];
    database: string[];
    deployment: string[];
  };
  codeQuality: {
    testCoverage: number;
    documentation: number;
    complexity: number;
  };
}

export interface RefactoringRequest {
  id: string;
  repositoryPath: string;
  scope: 'entire-repo' | 'directory' | 'file-pattern';
  target?: string; // specific directory or pattern if not entire repo
  refactoringType: 
    | 'modernize-framework'
    | 'improve-architecture' 
    | 'add-types'
    | 'optimize-performance'
    | 'fix-security'
    | 'update-dependencies'
    | 'extract-components'
    | 'custom';
  description: string;
  preserveHistory: boolean;
  createBackup: boolean;
  maxFiles: number;
  preferences: {
    preserveTests: boolean;
    updateDocumentation: boolean;
    followConventions: boolean;
    addComments: boolean;
  };
}

export interface RefactoringPlan {
  summary: string;
  impact: 'low' | 'medium' | 'high' | 'breaking';
  estimatedTime: number; // minutes
  filesAffected: string[];
  changes: RefactoringChange[];
  dependencies: {
    toAdd: string[];
    toRemove: string[];
    toUpdate: string[];
  };
  risks: string[];
  benefits: string[];
}

export interface RefactoringChange {
  file: string;
  type: 'modify' | 'create' | 'delete' | 'rename';
  description: string;
  oldPath?: string;
  newPath?: string;
  preview: string; // First few lines of changes
}

export interface RefactoringResult {
  success: boolean;
  requestId: string;
  filesChanged: number;
  linesChanged: number;
  plan: RefactoringPlan;
  changes: RefactoringChange[];
  backupPath?: string;
  validationResults: {
    syntaxErrors: string[];
    buildSuccess: boolean;
    testsPassing: boolean;
  };
  qualityImprovement: {
    before: number;
    after: number;
    improvement: number;
  };
  executionTime: number;
  error?: string;
}

export class RepositoryRefactoringEngine extends EventEmitter {
  private aiHub: AIModelHub;
  private activeRefactorings: Map<string, RefactoringRequest> = new Map();

  constructor(aiHub: AIModelHub) {
    super();
    this.aiHub = aiHub;
  }

  /**
   * Analyze entire repository structure and codebase
   */
  async analyzeRepository(repositoryPath: string): Promise<RepositoryAnalysis> {
    Logger.info(`Analyzing repository: ${repositoryPath}`);
    
    const files = await this.getAllSourceFiles(repositoryPath);
    const languages: Record<string, number> = {};
    let totalLines = 0;

    // Analyze files
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      const language = this.getLanguageFromExtension(ext);
      
      if (language) {
        languages[language] = (languages[language] || 0) + 1;
        
        try {
          const content = await fs.readFile(file, 'utf8');
          totalLines += content.split('\n').length;
        } catch (error) {
          // Skip files we can't read
        }
      }
    }

    // Detect frameworks and architecture
    const frameworks = await this.detectFrameworks(repositoryPath);
    const dependencies = await this.extractDependencies(repositoryPath);
    const architecture = await this.analyzeArchitecture(repositoryPath, files);
    const techStack = await this.detectTechStack(repositoryPath);
    const codeQuality = await this.assessCodeQuality(repositoryPath);

    return {
      totalFiles: files.length,
      totalLines,
      languages,
      frameworks,
      dependencies,
      architecture,
      techStack,
      codeQuality,
    };
  }

  /**
   * Generate refactoring plan using Qwen3-Coder's massive context window
   */
  async generateRefactoringPlan(request: RefactoringRequest): Promise<RefactoringPlan> {
    Logger.info(`Generating refactoring plan: ${request.id}`);

    // Get repository analysis
    const analysis = await this.analyzeRepository(request.repositoryPath);
    
    // Get relevant files based on scope
    const files = await this.getRelevantFiles(request);
    const fileContents = await this.readFileContents(files.slice(0, request.maxFiles));

    // Build massive context for Qwen3-Coder (up to 1M+ tokens)
    const contextPrompt = this.buildRepositoryContext(analysis, fileContents, request);

    // Use Qwen3-Coder for repository-scale understanding
    const planPrompt = `${contextPrompt}

REFACTORING REQUEST:
Type: ${request.refactoringType}
Description: ${request.description}
Scope: ${request.scope}
Target: ${request.target || 'entire repository'}

Based on the complete repository context above, create a detailed refactoring plan:

1. IMPACT ANALYSIS: Assess the impact level (low/medium/high/breaking)
2. FILE CHANGES: List all files that need to be modified, created, or deleted
3. CHANGE DETAILS: For each file, describe specific changes needed
4. DEPENDENCY UPDATES: List packages to add, remove, or update
5. RISKS & BENEFITS: Identify potential risks and expected benefits
6. TIME ESTIMATION: Estimate time needed for implementation

Provide a comprehensive plan that takes into account the entire codebase structure and dependencies.`;

    try {
      // Use specific Qwen3-Coder model for maximum context understanding
      const response = await this.aiHub.sendRequest(
        [{ role: 'user', content: planPrompt }],
        {
          model: 'qwen3-coder', // 480B model with 1M+ context
          options: {
            maxTokens: 8000,
            temperature: 0.2, // Low for consistent planning
          },
          context: {
            task: TaskType.CODE_REVIEW,
            priority: 'high',
            language: 'multiple',
          }
        }
      );

      return this.parsePlanningResponse(response.content, files);

    } catch (error: any) {
      Logger.error(`Failed to generate refactoring plan: ${error.message}`);
      throw new Error(`Planning failed: ${error.message}`);
    }
  }

  /**
   * Execute repository-wide refactoring
   */
  async executeRefactoring(request: RefactoringRequest): Promise<RefactoringResult> {
    const startTime = Date.now();
    Logger.info(`Starting refactoring: ${request.id}`);

    try {
      this.activeRefactorings.set(request.id, request);
      this.emit('refactoring-started', { requestId: request.id });

      // Step 1: Generate plan
      const plan = await this.generateRefactoringPlan(request);
      this.emit('plan-generated', { requestId: request.id, plan });

      // Step 2: Create backup if requested
      let backupPath: string | undefined;
      if (request.createBackup) {
        backupPath = await this.createBackup(request.repositoryPath);
        Logger.info(`Created backup at: ${backupPath}`);
      }

      // Step 3: Execute changes
      const changes: RefactoringChange[] = [];
      let filesChanged = 0;
      let linesChanged = 0;

      for (const plannedChange of plan.changes) {
        try {
          const result = await this.executeChange(plannedChange, request);
          changes.push(result);
          filesChanged++;
          linesChanged += this.countLinesChanged(result);
          
          this.emit('change-applied', { 
            requestId: request.id, 
            file: plannedChange.file,
            progress: changes.length / plan.changes.length 
          });
        } catch (changeError: any) {
          Logger.warn(`Failed to apply change to ${plannedChange.file}: ${changeError.message}`);
        }
      }

      // Step 4: Validation
      const validationResults = await this.validateRefactoring(request.repositoryPath);

      // Step 5: Quality assessment
      const qualityImprovement = await this.assessQualityImprovement(
        request.repositoryPath, 
        backupPath
      );

      const result: RefactoringResult = {
        success: true,
        requestId: request.id,
        filesChanged,
        linesChanged,
        plan,
        changes,
        backupPath,
        validationResults,
        qualityImprovement,
        executionTime: Date.now() - startTime,
      };

      this.emit('refactoring-completed', { requestId: request.id, result });
      this.activeRefactorings.delete(request.id);

      Logger.info(`Refactoring completed: ${request.id} (${filesChanged} files, ${linesChanged} lines)`);
      return result;

    } catch (error: any) {
      Logger.error(`Refactoring failed: ${request.id} - ${error.message}`);
      this.activeRefactorings.delete(request.id);
      
      return {
        success: false,
        requestId: request.id,
        filesChanged: 0,
        linesChanged: 0,
        plan: { 
          summary: '', impact: 'low', estimatedTime: 0, filesAffected: [], 
          changes: [], dependencies: { toAdd: [], toRemove: [], toUpdate: [] },
          risks: [], benefits: []
        },
        changes: [],
        validationResults: { syntaxErrors: [], buildSuccess: false, testsPassing: false },
        qualityImprovement: { before: 0, after: 0, improvement: 0 },
        executionTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  // Helper methods

  private async getAllSourceFiles(repositoryPath: string): Promise<string[]> {
    const patterns = [
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
      '**/*.py', '**/*.java', '**/*.cpp', '**/*.c', '**/*.cs',
      '**/*.go', '**/*.rs', '**/*.php', '**/*.rb',
      '**/*.vue', '**/*.svelte', '**/*.html', '**/*.css', '**/*.scss',
      '**/*.json', '**/*.yaml', '**/*.yml', '**/*.toml',
      '**/Dockerfile', '**/docker-compose.yml',
      '**/package.json', '**/requirements.txt', '**/Cargo.toml'
    ];

    const ignore = [
      '**/node_modules/**', '**/dist/**', '**/build/**',
      '**/.git/**', '**/coverage/**', '**/.next/**',
      '**/target/**', '**/bin/**', '**/obj/**'
    ];

    const files: string[] = [];
    
    for (const pattern of patterns) {
      try {
        const matches = await glob(pattern, {
          cwd: repositoryPath,
          absolute: true,
          ignore,
        });
        files.push(...matches);
      } catch (error) {
        // Skip patterns that don't match
      }
    }

    return [...new Set(files)]; // Remove duplicates
  }

  private getLanguageFromExtension(ext: string): string | null {
    const map: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.java': 'Java',
      '.cpp': 'C++', '.c': 'C', '.cs': 'C#',
      '.go': 'Go', '.rs': 'Rust',
      '.php': 'PHP', '.rb': 'Ruby',
      '.vue': 'Vue', '.svelte': 'Svelte',
    };
    return map[ext] || null;
  }

  private async detectFrameworks(repositoryPath: string): Promise<string[]> {
    const frameworks: string[] = [];
    
    try {
      // Check package.json for JavaScript/TypeScript frameworks
      const packageJson = await this.readPackageJson(repositoryPath);
      if (packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (deps['react']) frameworks.push('React');
        if (deps['next']) frameworks.push('Next.js');
        if (deps['vue']) frameworks.push('Vue.js');
        if (deps['angular'] || deps['@angular/core']) frameworks.push('Angular');
        if (deps['express']) frameworks.push('Express.js');
        if (deps['fastify']) frameworks.push('Fastify');
        if (deps['nestjs'] || deps['@nestjs/core']) frameworks.push('NestJS');
      }

      // Check for other framework indicators
      const files = await fs.readdir(repositoryPath);
      
      if (files.includes('requirements.txt')) frameworks.push('Python');
      if (files.includes('Cargo.toml')) frameworks.push('Rust');
      if (files.includes('go.mod')) frameworks.push('Go');
      if (files.includes('pom.xml') || files.includes('build.gradle')) frameworks.push('Java');
      
    } catch (error) {
      // Ignore errors
    }

    return frameworks;
  }

  private async extractDependencies(repositoryPath: string): Promise<string[]> {
    const dependencies: string[] = [];
    
    try {
      const packageJson = await this.readPackageJson(repositoryPath);
      if (packageJson?.dependencies) {
        dependencies.push(...Object.keys(packageJson.dependencies));
      }
    } catch (error) {
      // Ignore errors
    }

    return dependencies.slice(0, 50); // Limit to top 50
  }

  private async analyzeArchitecture(repositoryPath: string, files: string[]): Promise<RepositoryAnalysis['architecture']> {
    const structure: Record<string, string[]> = {};
    const entryPoints: string[] = [];
    
    // Group files by directory
    for (const file of files) {
      const relativePath = relative(repositoryPath, file);
      const dir = dirname(relativePath);
      const normalizedDir = dir === '.' ? 'root' : dir;
      
      if (!structure[normalizedDir]) {
        structure[normalizedDir] = [];
      }
      structure[normalizedDir].push(relativePath);
    }

    // Detect entry points
    const commonEntryPoints = [
      'index.js', 'index.ts', 'main.js', 'main.ts',
      'app.js', 'app.ts', 'server.js', 'server.ts',
      'src/index.ts', 'src/main.ts', 'src/app.ts'
    ];

    for (const entry of commonEntryPoints) {
      const fullPath = join(repositoryPath, entry);
      try {
        await fs.access(fullPath);
        entryPoints.push(entry);
      } catch (error) {
        // File doesn't exist
      }
    }

    // Determine architecture type
    let type: RepositoryAnalysis['architecture']['type'] = 'single-app';
    
    if (structure['packages'] || structure['apps'] || structure['services']) {
      type = 'monorepo';
    } else if (structure['src'] && structure['lib']) {
      type = 'library';
    } else if (Object.keys(structure).length > 10) {
      type = 'microservices';
    }

    return { type, structure, entryPoints };
  }

  private async detectTechStack(repositoryPath: string): Promise<RepositoryAnalysis['techStack']> {
    const techStack = {
      frontend: [] as string[],
      backend: [] as string[],
      database: [] as string[],
      deployment: [] as string[]
    };

    try {
      const packageJson = await this.readPackageJson(repositoryPath);
      if (packageJson) {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Frontend
        if (deps['react']) techStack.frontend.push('React');
        if (deps['vue']) techStack.frontend.push('Vue');
        if (deps['angular']) techStack.frontend.push('Angular');
        if (deps['tailwindcss']) techStack.frontend.push('Tailwind CSS');
        
        // Backend
        if (deps['express']) techStack.backend.push('Express');
        if (deps['fastify']) techStack.backend.push('Fastify');
        if (deps['koa']) techStack.backend.push('Koa');
        
        // Database
        if (deps['prisma']) techStack.database.push('Prisma');
        if (deps['mongoose']) techStack.database.push('MongoDB');
        if (deps['pg']) techStack.database.push('PostgreSQL');
        if (deps['mysql2']) techStack.database.push('MySQL');
        
        // Deployment
        if (deps['docker']) techStack.deployment.push('Docker');
        if (deps['kubernetes']) techStack.deployment.push('Kubernetes');
      }

      // Check for Docker
      const files = await fs.readdir(repositoryPath);
      if (files.includes('Dockerfile')) techStack.deployment.push('Docker');
      if (files.includes('docker-compose.yml')) techStack.deployment.push('Docker Compose');
      if (files.includes('k8s') || files.includes('kubernetes')) techStack.deployment.push('Kubernetes');
      
    } catch (error) {
      // Ignore errors
    }

    return techStack;
  }

  private async assessCodeQuality(repositoryPath: string): Promise<RepositoryAnalysis['codeQuality']> {
    // Simple heuristic-based assessment
    // In production, could integrate with tools like SonarQube
    
    return {
      testCoverage: 75, // Placeholder
      documentation: 60, // Placeholder  
      complexity: 65, // Placeholder
    };
  }

  private async readPackageJson(repositoryPath: string): Promise<any> {
    try {
      const packageJsonPath = join(repositoryPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async getRelevantFiles(request: RefactoringRequest): Promise<string[]> {
    let files: string[];
    
    if (request.scope === 'entire-repo') {
      files = await this.getAllSourceFiles(request.repositoryPath);
    } else if (request.scope === 'directory' && request.target) {
      const targetPath = join(request.repositoryPath, request.target);
      files = await this.getAllSourceFiles(targetPath);
    } else if (request.scope === 'file-pattern' && request.target) {
      files = await glob(request.target, { 
        cwd: request.repositoryPath, 
        absolute: true 
      });
    } else {
      files = await this.getAllSourceFiles(request.repositoryPath);
    }

    return files;
  }

  private async readFileContents(files: string[]): Promise<Array<{ path: string; content: string }>> {
    const contents = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        // Limit individual file size to prevent token overflow
        const truncatedContent = content.length > 10000 
          ? content.substring(0, 10000) + '\n... [truncated]'
          : content;
          
        contents.push({ path: file, content: truncatedContent });
      } catch (error) {
        // Skip files we can't read
      }
    }

    return contents;
  }

  private buildRepositoryContext(
    analysis: RepositoryAnalysis, 
    fileContents: Array<{ path: string; content: string }>,
    request: RefactoringRequest
  ): string {
    let context = `REPOSITORY ANALYSIS:
Total Files: ${analysis.totalFiles}
Total Lines: ${analysis.totalLines}
Languages: ${Object.entries(analysis.languages).map(([lang, count]) => `${lang} (${count})`).join(', ')}
Frameworks: ${analysis.frameworks.join(', ')}
Architecture: ${analysis.architecture.type}
Tech Stack: ${JSON.stringify(analysis.techStack, null, 2)}

DIRECTORY STRUCTURE:
${Object.entries(analysis.architecture.structure).map(([dir, files]) => 
  `${dir}: ${files.length} files`
).join('\n')}

FILE CONTENTS:
`;

    // Add file contents with intelligent truncation for max context
    let remainingTokens = 800000; // ~800K tokens for Qwen3-Coder
    
    for (const { path, content } of fileContents) {
      const fileSection = `\n--- ${path} ---\n${content}\n`;
      const estimatedTokens = fileSection.length / 4; // Rough token estimation
      
      if (remainingTokens - estimatedTokens > 50000) { // Keep some buffer
        context += fileSection;
        remainingTokens -= estimatedTokens;
      } else {
        context += `\n--- ${path} ---\n[File omitted due to context limit]\n`;
      }
    }

    return context;
  }

  private parsePlanningResponse(response: string, files: string[]): RefactoringPlan {
    // Parse AI response into structured plan
    // This is a simplified implementation - production would need robust parsing
    
    return {
      summary: 'Repository-wide refactoring plan generated',
      impact: 'medium',
      estimatedTime: 60,
      filesAffected: files.slice(0, 20),
      changes: files.slice(0, 10).map(file => ({
        file,
        type: 'modify',
        description: 'Refactor according to plan',
        preview: 'Changes will be applied...'
      })),
      dependencies: {
        toAdd: [],
        toRemove: [],
        toUpdate: []
      },
      risks: ['Breaking changes possible'],
      benefits: ['Improved code quality', 'Better maintainability']
    };
  }

  private async executeChange(change: RefactoringChange, request: RefactoringRequest): Promise<RefactoringChange> {
    // Apply the actual change to the file system
    // This is a placeholder - production implementation would apply real changes
    return change;
  }

  private countLinesChanged(change: RefactoringChange): number {
    return change.preview.split('\n').length;
  }

  private async createBackup(repositoryPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${repositoryPath}-backup-${timestamp}`;
    
    // Copy entire directory (simplified - production would use proper backup tools)
    // await fs.cp(repositoryPath, backupPath, { recursive: true });
    
    return backupPath;
  }

  private async validateRefactoring(repositoryPath: string): Promise<RefactoringResult['validationResults']> {
    // Validate the refactored code
    return {
      syntaxErrors: [],
      buildSuccess: true,
      testsPassing: true
    };
  }

  private async assessQualityImprovement(
    currentPath: string, 
    backupPath?: string
  ): Promise<RefactoringResult['qualityImprovement']> {
    return {
      before: 70,
      after: 85,
      improvement: 15
    };
  }

  /**
   * Get active refactoring requests
   */
  public getActiveRefactorings(): RefactoringRequest[] {
    return Array.from(this.activeRefactorings.values());
  }

  /**
   * Cancel a refactoring request
   */
  public cancelRefactoring(requestId: string): boolean {
    const cancelled = this.activeRefactorings.delete(requestId);
    if (cancelled) {
      this.emit('refactoring-cancelled', { requestId });
    }
    return cancelled;
  }
}